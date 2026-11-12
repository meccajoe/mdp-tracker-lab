\set ON_ERROR_STOP on
-- Run after identity/activity/costing fixtures, only in a disposable database.
do $$begin if current_database() not like 'mdp_lab_identity_test%' then raise exception 'Disposable fixture required';end if;end$$;
alter table public.projects add column client text not null default '',add column pm text not null default '',add column close_date date,add column due_date date;
alter table public.ada_quote_workspaces add column client_name text;
\ir ../supabase/migrations/20261112215251_lab_daily_project_sync.sql
\ir ../supabase/migrations/20261112220832_lab_sync_preserve_original_titles.sql
insert into public.ada_quote_workspaces(id,title,created_at,client_name,hubspot_deal_id,job_number) values('55555555-0000-4000-8000-000000000001','New won quote','2026-11-12','Test client','5000','500');
insert into public.lab_capacity_quote_versions(workspace_id,group_id,selected) values('55555555-0000-4000-8000-000000000001','55555555-0000-4000-8000-000000000001',true);
insert into public.quote_workbook_revisions(workspace_id,revision,document) values('55555555-0000-4000-8000-000000000001',1,'{"schedule":{"status":"Closed won","projectStatus":"Active"}}');
set role service_role;
do $$
declare run uuid;next_run uuid;scope uuid:='55555555-0000-4000-8000-000000000001';payload jsonb;target text;priorhash text;count_before integer;
begin
 run:=public.lab_claim_project_sync('manual');if run is null then raise exception 'Claim denied';end if;
 if public.lab_claim_project_sync('manual') is not null then raise exception 'Concurrent run accepted';end if;
 if jsonb_array_length(public.lab_project_sync_scope())<1 then raise exception 'Scope missing';end if;
 payload:=jsonb_build_object('workspaceId',scope,'expectedProjectId',null,'expectedJobNumber','500','revision',1,
 'document','{"schedule":{"status":"Closed won","projectStatus":"Active"}}'::jsonb,
 'identity','{"dealId":"5000","jobNumber":"500","name":"Canonical name","pm":"GM","closeDate":"2026-11-10","dueDate":"2026-12-01","hubspot":{"amount":100,"quotes":[]}}'::jsonb,
 'baseline','{"totals":{"price":100},"lines":[],"hubspot":{"quotes":[]}}'::jsonb,'baselineHash',repeat('a',64),
 'activityId','55555555-0000-4000-8000-000000000002',
 'activity','{"capturedAt":"2026-11-12T12:00:00Z","project":{"id":"source-job","job_number":"500","hubspot_deal_id":"5000"},"labor":[]}'::jsonb,'activityHash',repeat('b',64),
 'costing',jsonb_build_object('activitySnapshotId','55555555-0000-4000-8000-000000000002','activitySourceSha256',repeat('b',64),'sourceProjectId','source-job','jobNumber','500','dealId','5000','resolvedAt','2026-11-12T12:00:00Z','rows','[]'::jsonb,'expected','{"missingHours":0}'::jsonb),'costingHash',repeat('c',64));
 -- Failure after project work must roll the entire project transaction back.
 begin perform public.lab_apply_project_sync(run,scope,jsonb_set(payload,'{costing,dealId}','"wrong"'));raise exception 'Bad cost binding accepted';exception when raise_exception then if sqlerrm='Bad cost binding accepted' then raise;end if;end;
 if exists(select 1 from public.projects where job_number='500') then raise exception 'Partial project leaked';end if;
 target:=public.lab_apply_project_sync(run,scope,payload);
 if public.lab_apply_project_sync(run,scope,payload)<>target then raise exception 'Retry identity changed';end if;
 if (select count(*) from public.lab_project_activity_snapshots where project_id=target)<>1 or (select count(*) from public.lab_project_costing_snapshots where activity_snapshot_id='55555555-0000-4000-8000-000000000002')<>1 then raise exception 'Missing or duplicate atomic captures';end if;
 if (select snapshot->'original_workspace_titles'->>scope::text from public.lab_project_quote_sources where project_id=target)<>'New won quote' then raise exception 'Original quote name lost';end if;
 if (select tracker_project_id from public.ada_quote_workspaces where id=scope)<>target then raise exception 'Quote group link missing';end if;
 perform public.lab_finish_project_sync(run);
 begin perform public.lab_apply_project_sync(run,scope,payload);raise exception 'Finished run could write';exception when raise_exception then if sqlerrm='Finished run could write' then raise;end if;end;
 next_run:=public.lab_claim_project_sync('manual');
 payload:=payload||jsonb_build_object('expectedProjectId',target,'activityId','55555555-0000-4000-8000-000000000003','activity',jsonb_set(payload->'activity','{capturedAt}','"2026-11-13T12:00:00Z"'),'costing',jsonb_set(payload->'costing','{activitySnapshotId}','"55555555-0000-4000-8000-000000000003"'));
 select source_sha256 into priorhash from public.lab_project_quote_sources where project_id=target;
 perform public.lab_apply_project_sync(next_run,scope,payload||'{"baselineHash":"SHOULD_NOT_REPLACE"}'::jsonb);
 if (select source_sha256 from public.lab_project_quote_sources where project_id=target)<>priorhash then raise exception 'Refresh overwrote baseline';end if;
 if (select count(*) from public.lab_project_activity_snapshots where project_id=target)<>2 then raise exception 'History not retained';end if;
 perform public.lab_finish_project_sync(next_run);
 next_run:=public.lab_claim_project_sync('preview');
 begin perform public.lab_apply_project_sync(next_run,scope,payload);raise exception 'Preview wrote';exception when raise_exception then if sqlerrm='Preview wrote' then raise;end if;end;
 perform public.lab_record_project_sync_result(next_run,scope,target,'preview','WOULD_REFRESH');perform public.lab_finish_project_sync(next_run);
 next_run:=public.lab_claim_project_sync('manual');update public.lab_project_sync_runs set lease_until=now()-interval '1 second' where id=next_run;
 begin perform public.lab_apply_project_sync(next_run,scope,payload);raise exception 'Expired run wrote';exception when raise_exception then if sqlerrm='Expired run wrote' then raise;end if;end;
 run:=public.lab_claim_project_sync('scheduled');perform public.lab_finish_project_sync(run);
 if public.lab_claim_project_sync('scheduled') is not null then raise exception 'Duplicate daily run accepted';end if;
end$$;
reset role;
do $$begin
 if has_function_privilege('authenticated','public.lab_apply_project_sync(uuid,uuid,jsonb)','execute') or has_function_privilege('anon','public.lab_claim_project_sync(text)','execute') then raise exception 'Client sync RPC access';end if;
 if has_table_privilege('authenticated','public.lab_project_sync_runs','select') or has_table_privilege('anon','public.lab_project_sync_results','select') then raise exception 'Global logs exposed';end if;
end$$;
select 'PASS: fenced/overlap/daily claims, atomic rollback, retry, new project creation, immutable baseline/history, preview/client denials' evidence;
