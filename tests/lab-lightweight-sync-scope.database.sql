\set ON_ERROR_STOP on
\ir ../supabase/migrations/20261117220025_lab_sync_lightweight_scope.sql
insert into public.ada_quote_workspaces(id,title,created_at) values('99999999-0000-4000-8000-000000000001','Open large quote','2026-11-17');
insert into public.lab_capacity_quote_versions(workspace_id,group_id,selected) values('99999999-0000-4000-8000-000000000001','99999999-0000-4000-8000-000000000001',true);
insert into public.quote_workbook_revisions(workspace_id,revision,document) values('99999999-0000-4000-8000-000000000001',1,jsonb_build_object('schedule',jsonb_build_object('status','Possible'),'catalog',repeat('x',200000)));
set role service_role;
do $$declare scope jsonb;begin
 scope:=public.lab_project_sync_scope_v2();
 if exists(select 1 from jsonb_array_elements(scope)s where s->>'workspace_id'='99999999-0000-4000-8000-000000000001') then raise exception 'Open quote discovered';end if;
 if exists(select 1 from jsonb_array_elements(scope)s where (s->'document') ? 'catalog' or (s->'document') ? 'lines') then raise exception 'Full document in scope';end if;
 if octet_length(scope::text)>100000 then raise exception 'Oversized scope';end if;
 if public.lab_project_sync_document('77777777-0000-4000-8000-000000000001',1)->'schedule'->>'projectStatus'<>'Complete' then raise exception 'New quote document unavailable';end if;
 if public.lab_project_sync_document('77777777-0000-4000-8000-000000000001',2) is not null then raise exception 'Wrong revision accepted';end if;
end$$;
reset role;
do $$begin
 if has_function_privilege('authenticated','public.lab_project_sync_scope_v2()','execute') or has_function_privilege('anon','public.lab_project_sync_document(uuid,integer)','execute') then raise exception 'Client scope exposed';end if;
end$$;
select 'PASS: lightweight scope, open quote exclusion, revision-bound hydration, client denial' evidence;
