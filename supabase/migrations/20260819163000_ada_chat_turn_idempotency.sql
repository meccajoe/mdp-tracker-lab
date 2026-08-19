-- Durable ownership and replay for conversational Ada turns.
CREATE TABLE IF NOT EXISTS public.ada_chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  actor_email text NOT NULL,
  request_content text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  user_message_id uuid REFERENCES public.ada_quote_messages(id) ON DELETE SET NULL,
  assistant_message_id uuid REFERENCES public.ada_quote_messages(id) ON DELETE SET NULL,
  revision_id uuid REFERENCES public.ada_quote_revisions(id) ON DELETE SET NULL,
  response_json jsonb,
  error_message text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, actor_email, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_ada_chat_turns_workspace_created
  ON public.ada_chat_turns (workspace_id, created_at DESC);
ALTER TABLE public.ada_chat_turns ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ada_chat_turns_updated_at ON public.ada_chat_turns;
CREATE TRIGGER ada_chat_turns_updated_at
  BEFORE UPDATE ON public.ada_chat_turns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.claim_ada_chat_turn(
  p_workspace_id uuid,
  p_actor_email text,
  p_client_request_id uuid,
  p_request_content text
)
RETURNS TABLE(turn_id uuid, turn_status text, claimed boolean, response_json jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_turn public.ada_chat_turns;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_client_request_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE id = p_workspace_id AND lower(created_by_email) = lower(p_actor_email)
  ) THEN
    RAISE EXCEPTION 'Ada chat not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO existing_turn
  FROM public.ada_chat_turns
  WHERE workspace_id = p_workspace_id
    AND actor_email = lower(p_actor_email)
    AND client_request_id = p_client_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.ada_chat_turns (
      workspace_id, client_request_id, actor_email, request_content
    ) VALUES (
      p_workspace_id, p_client_request_id, lower(p_actor_email), p_request_content
    ) RETURNING * INTO existing_turn;
    RETURN QUERY SELECT existing_turn.id, existing_turn.status, true, existing_turn.response_json;
    RETURN;
  END IF;

  IF existing_turn.request_content <> p_request_content THEN
    RAISE EXCEPTION 'This request id belongs to different message content.' USING ERRCODE = '22023';
  END IF;

  IF existing_turn.status = 'completed' THEN
    RETURN QUERY SELECT existing_turn.id, existing_turn.status, false, existing_turn.response_json;
    RETURN;
  END IF;

  IF existing_turn.status = 'pending' AND existing_turn.claimed_at > now() - interval '15 minutes' THEN
    RETURN QUERY SELECT existing_turn.id, existing_turn.status, false, existing_turn.response_json;
    RETURN;
  END IF;

  UPDATE public.ada_chat_turns
  SET status = 'pending', claimed_at = now(), error_message = NULL, response_json = NULL, completed_at = NULL
  WHERE id = existing_turn.id
  RETURNING * INTO existing_turn;
  RETURN QUERY SELECT existing_turn.id, existing_turn.status, true, existing_turn.response_json;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ada_chat_turn(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ada_chat_turn(uuid, text, uuid, text) TO service_role;
