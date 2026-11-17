\set ON_ERROR_STOP on
-- Run after the existing daily sync fixture in a disposable local DB only.
do $$begin if current_database() not like 'mdp_lab_identity_test%' then raise exception 'Disposable fixture required';end if;end$$;
create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);
insert into vault.decrypted_secrets values('lab_project_sync_cron',repeat('x',32));
create schema net;
create table net.requests(id bigserial primary key,url text,headers jsonb,timeout_milliseconds integer);
create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into net.requests(url,headers,timeout_milliseconds) values(url,headers,timeout_milliseconds) returning id$$;
\ir ../supabase/migrations/20261117214710_lab_sync_won_complete_and_dispatch.sql
insert into public.ada_quote_workspaces(id,title,created_at,client_name) values('77777777-0000-4000-8000-000000000001','Completed quote','2026-11-17','Client');
insert into public.lab_capacity_quote_versions(workspace_id,group_id,selected) values('77777777-0000-4000-8000-000000000001','77777777-0000-4000-8000-000000000001',true);
insert into public.quote_workbook_revisions(workspace_id,revision,document) values('77777777-0000-4000-8000-000000000001',1,'{"schedule":{"status":"Closed won","projectStatus":"Complete"}}');
set role service_role;
do $$
declare run uuid;target text;payload jsonb;scope uuid:='77777777-0000-4000-8000-000000000001';
begin
 run:=public.lab_claim_project_sync('manual');
 payload:=jsonb_build_object('workspaceId',scope,'expectedProjectId',null,'expectedJobNumber',null,'expectedTitle','Completed quote','revision',1,
 'document','{"schedule":{"status":"Closed won","projectStatus":"Complete"}}'::jsonb,
 'identity','{"dealId":"5010","jobNumber":"501","name":"Completed canonical","pm":"GM","closeDate":"2026-10-01","dueDate":"2026-11-01","hubspot":{"amount":100,"quotes":[]}}'::jsonb,
 'baseline','{"totals":{"price":100},"lines":[],"sourceProjectStatus":"Completed","hubspot":{"quotes":[]}}'::jsonb,'baselineHash',repeat('a',64),
 'activityId','77777777-0000-4000-8000-000000000002','activity','{"capturedAt":"2026-11-17T12:00:00Z","project":{"id":"source-job","job_number":"501","hubspot_deal_id":"5010"},"labor":[]}'::jsonb,'activityHash',repeat('b',64),
 'costing',jsonb_build_object('activitySnapshotId','77777777-0000-4000-8000-000000000002','activitySourceSha256',repeat('b',64),'sourceProjectId','source-job','jobNumber','501','dealId','5010','resolvedAt','2026-11-17T12:00:00Z','rows','[]'::jsonb,'expected','{"missingHours":0}'::jsonb),'costingHash',repeat('c',64));
 begin perform public.lab_apply_project_sync(run,scope,jsonb_set(payload,'{expectedTitle}','"changed"'));raise exception 'Changed title accepted';exception when raise_exception then if sqlerrm='Changed title accepted' then raise;end if;end;
 if exists(select 1 from public.projects where job_number='501') then raise exception 'Failed transaction leaked project';end if;
 target:=public.lab_apply_project_sync(run,scope,payload);
 if (select status from public.projects where id=target)<>'Completed' then raise exception 'Completed job became Active';end if;
 if (select job_number from public.ada_quote_workspaces where id=scope)<>'501' or (select hubspot_deal_id from public.ada_quote_workspaces where id=scope)<>'5010' then raise exception 'Discovered identity missing';end if;
 if (select source_sha256 from public.lab_project_quote_sources where project_id=target)<>repeat('a',64) then raise exception 'Pinned baseline changed';end if;
 if public.lab_apply_project_sync(run,scope,payload)<>target then raise exception 'Retry created duplicate';end if;
 perform public.lab_finish_project_sync(run);
end$$;
reset role;
select lab_project_internal.request_project_sync('preview');
select lab_project_internal.request_project_sync('manual');
do $$begin
 if (select count(*) from net.requests where url like 'https://mdp-tracker-lab.vercel.app/api/lab-project-sync/scheduled?mode=%' and headers->>'Authorization'='Bearer '||repeat('x',32) and timeout_milliseconds=300000)<>2 then raise exception 'Invalid owner dispatch';end if;
 if has_function_privilege('service_role','lab_project_internal.request_project_sync(text)','execute') or has_function_privilege('authenticated','lab_project_internal.request_project_sync(text)','execute') or has_function_privilege('anon','lab_project_internal.request_project_sync(text)','execute') then raise exception 'Owner dispatcher exposed';end if;
 if (select prosecdef from pg_proc where oid='lab_project_internal.request_project_sync(text)'::regprocedure) then raise exception 'Owner dispatcher elevated';end if;
 begin perform lab_project_internal.request_project_sync('scheduled');raise exception 'Invalid mode accepted';exception when raise_exception then if sqlerrm='Invalid mode accepted' then raise;end if;end;
end$$;
select 'PASS: completed remains completed, discovered identity, atomic rollback, retry, pinned budget, owner-only bounded dispatch' evidence;
