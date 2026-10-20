-- Timed shared-media answers with manual host adjudication.
-- Run this migration in the Supabase SQL Editor after image-tile-scoring.sql.

ALTER TABLE public.room_trivia
  ADD COLUMN IF NOT EXISTS submitted_answers jsonb NOT NULL DEFAULT '{}'::jsonb;

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
  v_seconds integer;
  v_deadline bigint;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'playing' THEN RAISE EXCEPTION 'Room is not in a playing state'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id = v_room.id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'You are not a member of this room'; END IF;
  v_active_id := NULLIF(p_state->'players'->(COALESCE((p_state->>'current')::int,0))->>'userId','')::uuid;
  IF v_active_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the active player can start a question'; END IF;
  IF trim(COALESCE(p_answer,'')) = '' THEN RAISE EXCEPTION 'Correct answer is required'; END IF;

  v_seconds := GREATEST(10, LEAST(180, COALESCE((p_question->>'answerSeconds')::integer,30)));
  v_deadline := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint + v_seconds * 1000;
  v_question := COALESCE(p_question,'{}'::jsonb) || jsonb_build_object(
    'status','open','answeredUserIds','[]'::jsonb,'correctUserIds','[]'::jsonb,
    'answers','{}'::jsonb,'correctAnswer',NULL,'answerSeconds',v_seconds,'answerDeadline',v_deadline
  );
  v_state := p_state || jsonb_build_object('challenge',v_question);
  INSERT INTO public.room_trivia(room_id,correct_answer,answered_user_ids,correct_user_ids,status,winner_user_id,active_player_id,submitted_answers)
  VALUES(v_room.id,p_answer,'{}'::uuid[],'{}'::uuid[],'open',NULL,v_active_id,'{}'::jsonb)
  ON CONFLICT(room_id) DO UPDATE SET correct_answer=EXCLUDED.correct_answer,answered_user_ids='{}'::uuid[],
    correct_user_ids='{}'::uuid[],status='open',winner_user_id=NULL,active_player_id=EXCLUDED.active_player_id,
    submitted_answers='{}'::jsonb,created_at=now();
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
  v_answers jsonb;
  v_user uuid := auth.uid();
  v_player_name text;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'playing' THEN RAISE EXCEPTION 'Room is not in a playing state'; END IF;
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id = v_room.id AND user_id = v_user
  ) THEN RAISE EXCEPTION 'You are not a member of this room'; END IF;
  SELECT * INTO v_trivia FROM public.room_trivia WHERE room_id=v_room.id FOR UPDATE;
  IF NOT FOUND OR v_trivia.status <> 'open' THEN RAISE EXCEPTION 'Answer time has ended'; END IF;
  IF (v_room.state->'challenge'->>'answerDeadline') IS NULL
     OR floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint >= (v_room.state->'challenge'->>'answerDeadline')::bigint
  THEN RAISE EXCEPTION 'Answer time has ended'; END IF;
  IF v_user = ANY(v_trivia.answered_user_ids) THEN RAISE EXCEPTION 'You have already submitted an answer'; END IF;
  IF length(trim(COALESCE(p_answer,''))) = 0 THEN RAISE EXCEPTION 'Enter an answer first'; END IF;

  SELECT player_name INTO v_player_name FROM public.room_players WHERE room_id=v_room.id AND user_id=v_user;
  v_answered := array_append(v_trivia.answered_user_ids,v_user);
  v_answers := COALESCE(v_trivia.submitted_answers,'{}'::jsonb) ||
    jsonb_build_object(v_user::text,jsonb_build_object('text',left(trim(p_answer),500),'playerName',COALESCE(v_player_name,'Player')));
  UPDATE public.room_trivia SET answered_user_ids=v_answered,submitted_answers=v_answers WHERE room_id=v_room.id;

  v_state := COALESCE(v_room.state,'{}'::jsonb);
  v_state := jsonb_set(v_state,'{updatedBy}',to_jsonb(v_user::text),true);
  v_challenge := COALESCE(v_state->'challenge','{}'::jsonb) || jsonb_build_object(
    'answeredUserIds',to_jsonb(v_answered)
  );
  v_state := jsonb_set(v_state,'{challenge}',v_challenge,true);
  UPDATE public.game_rooms SET state=v_state WHERE id=v_room.id;
  RETURN jsonb_build_object('state',v_state,'submitted',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_trivia_answers(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_room public.game_rooms%ROWTYPE;
  v_trivia public.room_trivia%ROWTYPE;
  v_state jsonb;
  v_challenge jsonb;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'playing' THEN RAISE EXCEPTION 'Room is not in a playing state'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND user_id=auth.uid()
  ) THEN RAISE EXCEPTION 'You are not a member of this room'; END IF;
  SELECT * INTO v_trivia FROM public.room_trivia WHERE room_id=v_room.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active question'; END IF;
  IF v_trivia.status <> 'resolved' AND (
    v_room.state->'challenge'->>'answerDeadline' IS NULL OR
    floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint < (v_room.state->'challenge'->>'answerDeadline')::bigint
  ) THEN RAISE EXCEPTION 'Answer time has not ended'; END IF;

  v_state := COALESCE(v_room.state,'{}'::jsonb);
  v_challenge := COALESCE(v_state->'challenge','{}'::jsonb) || jsonb_build_object(
    'status','resolved','answeredUserIds',to_jsonb(v_trivia.answered_user_ids),
    'answers',COALESCE(v_trivia.submitted_answers,'{}'::jsonb),
    'correctAnswer',v_trivia.correct_answer,'resolvedAt',floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
  );
  UPDATE public.room_trivia SET status='resolved' WHERE room_id=v_room.id;
  v_state := jsonb_set(v_state,'{updatedBy}',to_jsonb(auth.uid()::text),true);
  v_state := jsonb_set(v_state,'{challenge}',v_challenge,true);
  UPDATE public.game_rooms SET state=v_state WHERE id=v_room.id;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_trivia_points(p_code text, p_user_id uuid, p_points integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_room public.game_rooms%ROWTYPE;
  v_state jsonb;
  v_challenge jsonb;
  v_players jsonb := '[]'::jsonb;
  v_player jsonb;
  v_score integer;
  v_previous integer;
  v_found boolean := false;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE code=upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'playing' THEN RAISE EXCEPTION 'Room is not in a playing state'; END IF;
  IF auth.uid() IS NULL OR v_room.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the host can award points'; END IF;
  IF p_points < 0 OR p_points > 10 THEN RAISE EXCEPTION 'Points must be between 0 and 10'; END IF;
  v_state := COALESCE(v_room.state,'{}'::jsonb);
  v_challenge := COALESCE(v_state->'challenge','{}'::jsonb);
  IF v_challenge->>'status' <> 'resolved' THEN RAISE EXCEPTION 'Answers are still being collected'; END IF;
  IF NOT (COALESCE(v_challenge->'answers','{}'::jsonb) ? p_user_id::text) THEN RAISE EXCEPTION 'That player has not submitted an answer'; END IF;

  v_previous := COALESCE((v_challenge->'awardedPoints'->>p_user_id::text)::integer,0);
  v_challenge := v_challenge || jsonb_build_object(
    'awardedPoints',COALESCE(v_challenge->'awardedPoints','{}'::jsonb) || jsonb_build_object(p_user_id::text,p_points)
  );
  FOR v_player IN SELECT value FROM jsonb_array_elements(COALESCE(v_state->'players','[]'::jsonb)) LOOP
    IF COALESCE(v_player->>'userId',v_player->>'user_id','')=p_user_id::text THEN
      v_score := COALESCE((v_player->>'score')::integer,0) + p_points - v_previous;
      v_player := jsonb_set(v_player,'{score}',to_jsonb(v_score),true);
      UPDATE public.room_players SET score=v_score WHERE room_id=v_room.id AND user_id=p_user_id;
      v_found := true;
    END IF;
    v_players := v_players || jsonb_build_array(v_player);
  END LOOP;
  IF NOT v_found THEN RAISE EXCEPTION 'Player not found in the game state'; END IF;
  v_state := jsonb_set(v_state,'{players}',v_players,true);
  v_state := jsonb_set(v_state,'{challenge}',v_challenge,true);
  v_state := jsonb_set(v_state,'{updatedBy}',to_jsonb(auth.uid()::text),true);
  UPDATE public.game_rooms SET state=v_state WHERE id=v_room.id;
  RETURN v_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_shared_trivia(text,jsonb,jsonb,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_trivia_answer(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_trivia_answers(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_trivia_points(text,uuid,integer) TO anon, authenticated;
