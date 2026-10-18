-- Anime Party: all-player image tile scoring
-- Run this migration in the Supabase SQL Editor after the original shared-trivia setup.

ALTER TABLE public.room_trivia
  ADD COLUMN IF NOT EXISTS active_player_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS correct_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.start_shared_trivia(
  p_code text, p_state jsonb, p_question jsonb, p_answer text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_room public.game_rooms%ROWTYPE;
  v_active_id uuid;
  v_question jsonb;
  v_state jsonb;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'playing' THEN RAISE EXCEPTION 'Room is not in a playing state'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id = v_room.id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'You are not a member of this room'; END IF;

  -- Cast the active player's userId from the snapshot to UUID.
  v_active_id := NULLIF(p_state->'players'->(COALESCE((p_state->>'current')::int,0))->>'userId','')::uuid;
  IF v_active_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the active player can start a question'; END IF;
  IF trim(COALESCE(p_answer,'')) = '' THEN RAISE EXCEPTION 'Correct answer is required'; END IF;

  v_question := COALESCE(p_question,'{}'::jsonb) || jsonb_build_object(
    'status','open','answeredUserIds','[]'::jsonb,'correctUserIds','[]'::jsonb,'correctAnswer',NULL
  );
  v_state := p_state || jsonb_build_object('challenge',v_question);
  INSERT INTO public.room_trivia(room_id,correct_answer,answered_user_ids,correct_user_ids,status,winner_user_id,active_player_id)
  VALUES(v_room.id,p_answer,'{}'::uuid[],'{}'::uuid[],'open',NULL,v_active_id)
  ON CONFLICT(room_id) DO UPDATE SET correct_answer=EXCLUDED.correct_answer,answered_user_ids='{}'::uuid[],
    correct_user_ids='{}'::uuid[],status='open',winner_user_id=NULL,active_player_id=EXCLUDED.active_player_id,created_at=now();
  UPDATE public.game_rooms SET state=v_state,status='playing' WHERE id=v_room.id;
  RETURN v_state;
END;
$$;

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
  v_player_count integer;
  v_user uuid := auth.uid();
  v_player jsonb;
  v_players jsonb := '[]'::jsonb;
  v_new_score integer;
  v_user_text text;
  v_winner_name text;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'playing' THEN RAISE EXCEPTION 'Room is not in a playing state'; END IF;
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id = v_room.id AND user_id = v_user
  ) THEN RAISE EXCEPTION 'You are not a member of this room'; END IF;
  SELECT * INTO v_trivia FROM public.room_trivia WHERE room_id=v_room.id FOR UPDATE;
  IF NOT FOUND OR v_trivia.status <> 'open' THEN RAISE EXCEPTION 'Question is already resolved'; END IF;
  IF v_user = ANY(v_trivia.answered_user_ids) THEN RAISE EXCEPTION 'You have already answered'; END IF;

  v_answered := array_append(v_trivia.answered_user_ids,v_user);
  v_is_correct := lower(trim(COALESCE(p_answer,''))) = lower(trim(v_trivia.correct_answer));
  v_correct := v_trivia.correct_user_ids;
  IF v_is_correct THEN v_correct := array_append(v_correct,v_user); END IF;
  SELECT count(*) INTO v_player_count FROM public.room_players WHERE room_id=v_room.id;
  -- First correct answer resolves immediately; if everyone is wrong, reveal the answer.
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

GRANT EXECUTE ON FUNCTION public.start_shared_trivia(text,jsonb,jsonb,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_trivia_answer(text,text) TO anon, authenticated;
