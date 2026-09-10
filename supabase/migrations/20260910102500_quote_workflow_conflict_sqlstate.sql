-- Prevent PostgREST/Hasql from treating application concurrency conflicts as
-- retryable PostgreSQL serialization failures. Older PostgREST runtimes retry
-- SQLSTATE 40001 indefinitely, so governed stale-version checks use PT409.
DO $$
DECLARE
  target_signature regprocedure;
  source_definition text;
  retry_safe_definition text;
BEGIN
  FOREACH target_signature IN ARRAY ARRAY[
    'public.create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text)'::regprocedure,
    'public.reject_quote_proposal(uuid,uuid,text,bigint,text,text)'::regprocedure,
    'public.accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text)'::regprocedure,
    'public.append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text)'::regprocedure
  ]
  LOOP
    source_definition := pg_get_functiondef(target_signature);
    retry_safe_definition := replace(
      source_definition,
      'ERRCODE = ''40001''',
      'ERRCODE = ''PT409'''
    );

    IF retry_safe_definition IS DISTINCT FROM source_definition THEN
      EXECUTE retry_safe_definition;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_proc function_row
    WHERE function_row.oid = ANY (ARRAY[
      'public.create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text)'::regprocedure,
      'public.reject_quote_proposal(uuid,uuid,text,bigint,text,text)'::regprocedure,
      'public.accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text)'::regprocedure,
      'public.append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text)'::regprocedure
    ]::oid[])
      AND pg_get_functiondef(function_row.oid) LIKE '%ERRCODE = ''40001''%'
  ) THEN
    RAISE EXCEPTION 'Retryable 40001 conflict code remains in a governed quote workflow function.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_quote_proposal(uuid,uuid,text,bigint,text,text) TO authenticated;
