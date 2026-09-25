\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP on
WITH counts AS (
  SELECT
    count(*) FILTER (WHERE c.relkind IN ('r','p')) AS tables,
    count(*) FILTER (WHERE c.relkind = 'v') AS views,
    count(*) FILTER (WHERE c.relkind = 'm') AS materialized_views,
    count(*) FILTER (WHERE c.relkind = 'S') AS sequences,
    count(*) FILTER (WHERE c.relkind = 'f') AS foreign_tables,
    count(*) FILTER (WHERE c.relkind = 'p') AS partitioned_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
), function_counts AS (
  SELECT count(*) AS functions,
         count(*) FILTER (WHERE p.prosecdef) AS security_definer_functions
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
), policy_counts AS (
  SELECT count(*) AS policies FROM pg_policy p
  JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
), trigger_counts AS (
  SELECT count(*) AS triggers FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal
)
SELECT json_build_object(
  'tables',counts.tables,'views',counts.views,'materialized_views',counts.materialized_views,
  'sequences',counts.sequences,'foreign_tables',counts.foreign_tables,'partitioned_tables',counts.partitioned_tables,
  'functions',function_counts.functions,'security_definer_functions',function_counts.security_definer_functions,
  'policies',policy_counts.policies,'triggers',trigger_counts.triggers
)::text
FROM counts,function_counts,policy_counts,trigger_counts;

SELECT json_build_object('extensions',coalesce(json_agg(json_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion) ORDER BY e.extname),'[]'::json))::text
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace;

SELECT json_build_object('public_types',coalesce(json_agg(json_build_object('name',t.typname,'kind',t.typtype) ORDER BY t.typname),'[]'::json))::text
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' AND t.typtype IN ('e','d','c') AND t.typrelid=0;

SELECT json_build_object('security_definer',coalesce(json_agg(json_build_object(
  'identity',p.oid::regprocedure::text,'owner',r.rolname,'language',l.lanname,
  'execute_public',has_function_privilege('public',p.oid,'EXECUTE')) ORDER BY p.oid::regprocedure::text),'[]'::json))::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_roles r ON r.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname='public' AND p.prokind IN ('f','p') AND p.prosecdef;

SELECT json_build_object('risky_functions',coalesce(json_agg(json_build_object(
  'identity',p.oid::regprocedure::text,
  'signals',array_remove(ARRAY[
    CASE WHEN pg_get_functiondef(p.oid) ~* '(https?://|supabase\\.co)' THEN 'endpoint' END,
    CASE WHEN pg_get_functiondef(p.oid) ~* '(http_|net\\.|dblink|pg_net|webhook)' THEN 'outbound-call' END,
    CASE WHEN pg_get_functiondef(p.oid) ~* '(api[_ -]?key|token|secret|password|authorization)' THEN 'credential-term' END
  ],NULL)) ORDER BY p.oid::regprocedure::text),'[]'::json))::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind IN ('f','p')
  AND pg_get_functiondef(p.oid) ~* '(https?://|supabase\\.co|http_|net\\.|dblink|pg_net|webhook|api[_ -]?key|token|secret|password|authorization)';

SELECT json_build_object('external_schema_dependencies',coalesce(json_agg(DISTINCT jsonb_build_object(
  'object',dep.object_name,'kind',dep.kind,'schema',dep.external_schema)),'[]'::json))::text
FROM (
  SELECT p.oid::regprocedure::text object_name,'function-text' kind,
         CASE WHEN pg_get_functiondef(p.oid) ~* '\mauth\\.' THEN 'auth'
              WHEN pg_get_functiondef(p.oid) ~* '\mstorage\\.' THEN 'storage' END external_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind IN ('f','p') AND pg_get_functiondef(p.oid) ~* '(\mauth\\.|\mstorage\\.)'
  UNION ALL
  SELECT format('%I.%I',n.nspname,c.relname),'foreign-key',rn.nspname
  FROM pg_constraint con
  JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_class rc ON rc.oid=con.confrelid JOIN pg_namespace rn ON rn.oid=rc.relnamespace
  WHERE n.nspname='public' AND con.contype='f' AND rn.nspname IN ('auth','storage')
) dep WHERE dep.external_schema IS NOT NULL;

SELECT json_build_object('default_risks',coalesce(json_agg(json_build_object(
  'column',format('%I.%I',c.relname,a.attname),
  'signals',array_remove(ARRAY[
    CASE WHEN pg_get_expr(d.adbin,d.adrelid) ~* '(https?://|supabase\\.co)' THEN 'endpoint' END,
    CASE WHEN pg_get_expr(d.adbin,d.adrelid) ~* '(api[_ -]?key|token|secret|password)' THEN 'credential-term' END
  ],NULL)) ORDER BY c.relname,a.attnum),'[]'::json))::text
FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND pg_get_expr(d.adbin,d.adrelid) ~* '(https?://|supabase\\.co|api[_ -]?key|token|secret|password)';

SELECT json_build_object('owners',coalesce(json_agg(DISTINCT r.rolname ORDER BY r.rolname),'[]'::json))::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
WHERE n.nspname='public';

SELECT json_build_object('acl_grantees',coalesce(json_agg(DISTINCT coalesce(r.rolname,'PUBLIC') ORDER BY coalesce(r.rolname,'PUBLIC')),'[]'::json))::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
LEFT JOIN pg_roles r ON r.oid=a.grantee
WHERE n.nspname='public';
