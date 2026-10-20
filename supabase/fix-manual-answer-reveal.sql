-- Fix manual-scoring rounds so the final submission reveals answers atomically.
-- Run this migration in Supabase SQL Editor after multiple-choice-and-manual-scoring.sql.
-- Restore normal multiple-choice resolution while retaining timed, host-scored text answers.
-- Run after shared-media-answer-round.sql and resolve-when-all-answered.sql.

CREATE OR REPLACE FUNCTION public.submit_trivia_answer(p_code text, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_room public.game_rooms%ROWTYPE;
  v_trivia public.room_trivia%ROWTYPE;
  v_state jsonb;
  v_challenge jsonb;
  v_answered uuid[];
  v_correct uuid[];
  v_is_correct boolean;
  v_resolved boolean;
  v_manual boolean;
  v_player_count integer;
  v_user uuid := auth.uid();
  v_player jsonb;
  v_players jsonb := '[]'::jsonb;
  v_new_score integer;
  v_user_text text;
  v_winner_name text;
  v_player_name text;
  v_answers jsonb;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'playing' THEN RAISE EXCEPTION 'Room is not in a playing state'; END IF;
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id = v_room.id AND user_id = v_user
  ) THEN RAISE EXCEPTION 'You are not a member of this room'; END IF;
  SELECT * INTO v_trivia FROM public.room_trivia WHERE room_id=v_room.id FOR UPDATE;
  IF NOT FOUND OR v_trivia.status <> 'open' THEN RAISE EXCEPTION 'Question is already resolved'; END IF;
  IF v_user = ANY(v_trivia.answered_user_ids) THEN RAISE EXCEPTION 'You have already answered'; END IF;
  IF length(trim(COALESCE(p_answer,''))) = 0 THEN RAISE EXCEPTION 'Enter an answer first'; END IF;

  v_manual := COALESCE(v_room.state->'challenge'->>'answerMode','') = 'manual'
    OR COALESCE(v_room.state->'challenge'->>'type','') = 'media-library';

  IF v_manual THEN
    IF (v_room.state->'challenge'->>'answerDeadline') IS NULL
       OR floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint >= (v_room.state->'challenge'->>'answerDeadline')::bigint
    THEN RAISE EXCEPTION 'Answer time has ended'; END IF;

    SELECT player_name INTO v_player_name FROM public.room_players WHERE room_id=v_room.id AND user_id=v_user;
    v_answered := array_append(COALESCE(v_trivia.answered_user_ids,'{}'::uuid[]),v_user);
    v_answers := COALESCE(v_trivia.submitted_answers,'{}'::jsonb) ||
      jsonb_build_object(v_user::text,jsonb_build_object('text',left(trim(p_answer),500),'playerName',COALESCE(v_player_name,'Player')));
    SELECT count(*)::integer INTO v_player_count FROM public.room_players WHERE room_id=v_room.id;
    v_resolved := v_player_count > 0 AND cardinality(v_answered) >= v_player_count;

    UPDATE public.room_trivia SET answered_user_ids=v_answered,submitted_answers=v_answers,
      status=CASE WHEN v_resolved THEN 'resolved' ELSE 'open' END WHERE room_id=v_room.id;

    v_state := COALESCE(v_room.state,'{}'::jsonb);
    v_state := jsonb_set(v_state,'{updatedBy}',to_jsonb(v_user::text),true);
    v_challenge := COALESCE(v_state->'challenge','{}'::jsonb) || jsonb_build_object(
      'answeredUserIds',to_jsonb(v_answered)
    );
    IF v_resolved THEN
      v_challenge := v_challenge || jsonb_build_object(
        'status','resolved','answers',v_answers,'correctAnswer',v_trivia.correct_answer,
        'resolvedAt',floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
      );
    END IF;
    v_state := jsonb_set(v_state,'{challenge}',v_challenge,true);
    UPDATE public.game_rooms SET state=v_state WHERE id=v_room.id;
    RETURN jsonb_build_object('state',v_state,'submitted',true,'resolved',v_resolved);
  END IF;

  -- Multiple choice: the first correct answer wins; if everyone answers incorrectly, reveal the answer.
  v_answered := array_append(v_trivia.answered_user_ids,v_user);
  v_is_correct := lower(trim(COALESCE(p_answer,''))) = lower(trim(v_trivia.correct_answer));
  v_correct := v_trivia.correct_user_ids;
  IF v_is_correct THEN v_correct := array_append(v_correct,v_user); END IF;
  SELECT count(*)::integer INTO v_player_count FROM public.room_players WHERE room_id=v_room.id;
  v_resolved := v_is_correct OR cardinality(v_answered) >= v_player_count;

  UPDATE public.room_trivia SET answered_user_ids=v_answered,correct_user_ids=v_correct,
    status=CASE WHEN v_resolved THEN 'resolved' ELSE 'open' END,
    winner_user_id=CASE WHEN v_is_correct THEN v_user ELSE NULL END
  WHERE room_id=v_room.id;

  SELECT player_name INTO v_winner_name FROM public.room_players
    WHERE room_id=v_room.id AND user_id=v_user AND v_is_correct;

  v_state := COALESCE(v_room.state,'{}'::jsonb);
  v_state := jsonb_set(v_state,'{updatedBy}',to_jsonb(v_user::text),true);
  v_challenge := COALESCE(v_state->'challenge','{}'::jsonb) || jsonb_build_object(
    'answeredUserIds',to_jsonb(v_answered),'correctUserIds',to_jsonb(v_correct),
    'status',CASE WHEN v_resolved THEN 'resolved' ELSE 'open' END,
    'winnerUserId',CASE WHEN v_is_correct THEN v_user ELSE NULL END,
    'winnerName',CASE WHEN v_is_correct THEN v_winner_name ELSE NULL END
  );
  IF v_resolved THEN v_challenge := v_challenge || jsonb_build_object('correctAnswer',v_trivia.correct_answer); END IF;

  FOR v_player IN SELECT value FROM jsonb_array_elements(COALESCE(v_state->'players','[]'::jsonb)) LOOP
    v_user_text := COALESCE(v_player->>'userId',v_player->>'user_id','');
    IF v_is_correct AND v_user_text <> '' AND v_user_text::uuid = v_user THEN
      v_new_score := COALESCE((v_player->>'score')::integer,0) + 2;
      v_player := jsonb_set(v_player,'{score}',to_jsonb(v_new_score),true);
      UPDATE public.room_players SET score=v_new_score WHERE room_id=v_room.id AND user_id=v_user;
    END IF;
    v_players := v_players || jsonb_build_array(v_player);
  END LOOP;
  v_state := jsonb_set(v_state,'{players}',v_players,true);
  v_state := jsonb_set(v_state,'{challenge}',v_challenge,true);
  UPDATE public.game_rooms SET state=v_state WHERE id=v_room.id;
  RETURN jsonb_build_object('state',v_state,'correct',v_is_correct,'resolved',v_resolved);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_trivia_answer(text,text) TO anon, authenticated;
