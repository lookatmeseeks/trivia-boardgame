-- Allow media answer rounds to resolve immediately when every room player has submitted.
-- Apply this after shared-media-answer-round.sql.

CREATE OR REPLACE FUNCTION public.resolve_trivia_answers(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_room public.game_rooms%ROWTYPE;
  v_trivia public.room_trivia%ROWTYPE;
  v_state jsonb;
  v_challenge jsonb;
  v_player_count integer;
  v_all_answered boolean;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR v_room.status <> 'playing' THEN RAISE EXCEPTION 'Room is not in a playing state'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND user_id=auth.uid()
  ) THEN RAISE EXCEPTION 'You are not a member of this room'; END IF;
  SELECT * INTO v_trivia FROM public.room_trivia WHERE room_id=v_room.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active question'; END IF;

  SELECT count(*)::integer INTO v_player_count
  FROM public.room_players WHERE room_id=v_room.id;
  v_all_answered := v_player_count > 0
    AND COALESCE(cardinality(v_trivia.answered_user_ids),0) >= v_player_count;

  IF v_trivia.status <> 'resolved'
     AND NOT v_all_answered
     AND (
       v_room.state->'challenge'->>'answerDeadline' IS NULL OR
       floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
         < (v_room.state->'challenge'->>'answerDeadline')::bigint
     )
  THEN RAISE EXCEPTION 'Answer time has not ended'; END IF;

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

GRANT EXECUTE ON FUNCTION public.resolve_trivia_answers(text) TO anon, authenticated;
