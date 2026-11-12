-- Lab only. Production access is read-only; this schema stores job state/imports.
create table public.lab_project_sync_runs(
 id uuid primary key default gen_random_uuid(),local_day date not null,
 mode text not null check(mode in ('scheduled','manual','preview')),
 status text not null default 'running' check(status in ('running','succeeded','partial','failed','preview')),
 started_at timestamptz not null default now(),finished_at timestamptz,
 lease_until timestamptz not null default now()+interval '6 minutes',
 error_code text
);
create table public.lab_project_sync_results(
 run_id uuid not null references public.lab_project_sync_runs(id),
 scope_id uuid not null,project_id text references public.projects(id),
 outcome text not null check(outcome in ('created','refreshed','preview','exception')),
 code text not null,activity_snapshot_id uuid references public.lab_project_activity_snapshots(id),
 missing_hours numeric,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),primary key(run_id,scope_id)
);
alter table public.lab_project_sync_runs enable row level security;
alter table public.lab_project_sync_results enable row level security;
revoke all on public.lab_project_sync_runs,public.lab_project_sync_results from anon,authenticated,service_role;
grant select,insert,update on public.lab_project_sync_runs to service_role;
grant select,insert on public.lab_project_sync_results to service_role;
-- Only the actor-checked admin API reads the global run log through the server role.
create index lab_project_sync_runs_recent on public.lab_project_sync_runs(started_at desc);
create function public.lab_claim_project_sync(p_mode text) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare run_id uuid;today date:=(now() at time zone 'America/Chicago')::date;
begin
 if p_mode not in ('scheduled','manual','preview') then raise exception 'Invalid mode';end if;
 perform pg_advisory_xact_lock(hashtextextended('lab-daily-project-sync',0));
 if exists(select 1 from public.lab_project_sync_runs where status='running' and lease_until>now()) then return null;end if;
 update public.lab_project_sync_runs set status='failed',finished_at=now(),error_code='LEASE_EXPIRED' where status='running' and lease_until<=now();
 if p_mode='scheduled' and exists(select 1 from public.lab_project_sync_runs where local_day=today and mode='scheduled' and status in ('succeeded','partial')) then return null;end if;
 insert into public.lab_project_sync_runs(local_day,mode) values(today,p_mode) returning id into run_id;
 return run_id;
end $$;
create function public.lab_project_sync_scope() returns jsonb
language sql security invoker set search_path=pg_catalog,public as $$
 with heads as (
 select distinct on(v.group_id) v.group_id,w.id workspace_id,w.title,w.client_name,w.hubspot_deal_id,w.job_number,w.created_at
 from public.lab_capacity_quote_versions v join public.ada_quote_workspaces w on w.id=v.workspace_id
 where w.archived_at is null and w.lifecycle_status<>'archived'
 order by v.group_id,w.created_at desc,v.selected desc,w.id
 ) select coalesce(jsonb_agg(to_jsonb(scope) order by scope.group_id),'[]'::jsonb) from (
 select h.*,r.revision,r.document,s.project_id,p.hubspot_deal_id linked_deal_id,p.job_number linked_job_number
 from heads h join lateral (select revision,document from public.quote_workbook_revisions where workspace_id=h.workspace_id order by revision desc limit 1) r on true
 left join lateral(select s.project_id from public.lab_project_quote_sources s join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id where v.group_id=h.group_id) s on true
 left join public.projects p on p.id=s.project_id
 ) scope
$$;
create function public.lab_record_project_sync_result(p_run uuid,p_scope uuid,p_project text,p_outcome text,p_code text,p_details jsonb default '{}'::jsonb) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform id from public.lab_project_sync_runs where id=p_run and status='running' and lease_until>now() for update;
 if not found then raise exception 'Sync lease expired';end if;
 if p_outcome not in ('exception','preview') or p_code !~ '^[A-Z_]{1,80}$' then raise exception 'Invalid outcome';end if;
 insert into public.lab_project_sync_results(run_id,scope_id,project_id,outcome,code,details) values(p_run,p_scope,p_project,p_outcome,p_code,p_details) on conflict do nothing;
end $$;
create function public.lab_apply_project_sync(p_run uuid,p_scope uuid,p_payload jsonb) returns text
language plpgsql security invoker set search_path=pg_catalog,public as $$
#variable_conflict use_variable
declare
 w public.ada_quote_workspaces;identity jsonb:=p_payload->'identity';baseline jsonb:=p_payload->'baseline';
 project_id text;existing_id text;act jsonb:=p_payload->'activity';cost jsonb:=p_payload->'costing';
 activity_id uuid:=(p_payload->>'activityId')::uuid;state text;outcome text;
begin
 perform id from public.lab_project_sync_runs where id=p_run and status='running' and mode<>'preview' and lease_until>now() for update;
 if not found then raise exception 'Sync lease expired or preview mode';end if;
 if exists(select 1 from public.lab_project_sync_results where run_id=p_run and scope_id=p_scope) then
  return (select r.project_id from public.lab_project_sync_results r where r.run_id=p_run and r.scope_id=p_scope);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('lab-sync-group:'||p_scope::text,0));
 perform workspace_id from public.lab_capacity_quote_versions where group_id=p_scope for share;
 select a.* into w from public.ada_quote_workspaces a join public.lab_capacity_quote_versions v on v.workspace_id=a.id
 where v.group_id=p_scope and a.archived_at is null and a.lifecycle_status<>'archived'
 order by a.created_at desc,v.selected desc,a.id limit 1 for update of a;
 if not found or w.id::text<>p_payload->>'workspaceId' then raise exception 'Quote head changed';end if;
 select s.project_id into existing_id from public.lab_project_quote_sources s join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id where v.group_id=p_scope;
 if (select count(*) from public.lab_project_quote_sources s join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id where v.group_id=p_scope)>1 then raise exception 'Conflicting project group';end if;
 if existing_id is distinct from p_payload->>'expectedProjectId' then raise exception 'Project link changed';end if;
 if (identity->>'dealId') !~ '^\d+$' or (identity->>'jobNumber') !~ '^\d+$' or nullif(btrim(identity->>'name'),'') is null then raise exception 'Missing canonical identity';end if;
 perform pg_advisory_xact_lock(hashtextextended('lab-job:'||(identity->>'jobNumber'),0));
 perform pg_advisory_xact_lock(hashtextextended('lab-deal:'||(identity->>'dealId'),0));
 if exists(select 1 from public.projects p where (p.hubspot_deal_id=identity->>'dealId' or p.job_number=identity->>'jobNumber') and p.id is distinct from existing_id) then raise exception 'Identity conflict';end if;
 if existing_id is null then
  if w.hubspot_deal_id is distinct from identity->>'dealId' or w.job_number is distinct from identity->>'jobNumber' then raise exception 'Quote identity changed';end if;
  if (select revision from public.quote_workbook_revisions where workspace_id=w.id order by revision desc limit 1)<>(p_payload->>'revision')::integer
    or not exists(select 1 from public.quote_workbook_revisions where workspace_id=w.id and revision=(p_payload->>'revision')::integer and document=p_payload->'document') then raise exception 'Quote revision changed';end if;
  if coalesce(nullif(p_payload->'document'->'planning'->>'status',''),p_payload->'document'->'schedule'->>'status','') not in ('Closed won','In production')
   or (coalesce(nullif(p_payload->'document'->'planning'->>'status',''),p_payload->'document'->'schedule'->>'status','')<>'In production' and coalesce(nullif(p_payload->'document'->'schedule'->>'projectStatus',''),'Active')<>'Active') then raise exception 'Quote is not Closed Won Active';end if;
  if jsonb_typeof(baseline->'totals')<>'object' or jsonb_typeof(baseline->'lines')<>'array' or baseline->'totals'->>'price' is null then raise exception 'Invalid baseline';end if;
  project_id:='lab-'||w.id::text;
  insert into public.projects(id,name,client,pm,status,hubspot_deal_id,job_number,close_date,due_date)
   values(project_id,identity->>'name',coalesce(nullif(w.client_name,''),'Pending client'),coalesce(identity->>'pm',''),'Active',identity->>'dealId',identity->>'jobNumber',(identity->>'closeDate')::date,(identity->>'dueDate')::date);
  insert into public.lab_project_quote_sources(project_id,workspace_id,workbook_revision,source_sha256,snapshot)
   values(project_id,w.id,(p_payload->>'revision')::integer,p_payload->>'baselineHash',baseline);
  perform lab_project_internal.lab_sync_project_identity(project_id);
  update public.projects p set status=coalesce(lab_project_internal.lab_project_quote_status(project_id),'Active') where p.id=project_id;
  outcome:='created';
 else
  project_id:=existing_id;
  if not exists(select 1 from public.projects p where p.id=project_id and p.hubspot_deal_id=identity->>'dealId' and p.job_number=p_payload->>'expectedJobNumber') then raise exception 'Project identity changed';end if;
  outcome:='refreshed';
 end if;
 -- The existing RPC preserves quote baselines and applies current quote status.
 perform public.apply_lab_hubspot_identity(project_id,identity->>'dealId',identity->>'name',identity->>'jobNumber');
 update public.projects p set pm=coalesce(identity->>'pm',p.pm),close_date=(identity->>'closeDate')::date,due_date=(identity->>'dueDate')::date where p.id=project_id;
 update public.lab_project_quote_sources s set snapshot=jsonb_set(s.snapshot,'{hubspot}',
  coalesce(s.snapshot->'hubspot','{}')||(identity->'hubspot')||jsonb_build_object('selectedQuoteId',s.snapshot->'hubspot'->'selectedQuoteId')) where s.project_id=project_id;
 if act->'project'->>'job_number' is distinct from identity->>'jobNumber' or act->'project'->>'hubspot_deal_id' is distinct from identity->>'dealId'
  or cost->>'activitySnapshotId' is distinct from activity_id::text or cost->>'activitySourceSha256' is distinct from p_payload->>'activityHash'
  or cost->>'sourceProjectId' is distinct from act->'project'->>'id' or cost->>'jobNumber' is distinct from identity->>'jobNumber' or cost->>'dealId' is distinct from identity->>'dealId'
  or jsonb_array_length(act->'labor')<>jsonb_array_length(cost->'rows') then raise exception 'Activity/costing binding mismatch';end if;
 insert into public.lab_project_activity_snapshots(id,project_id,source_project_id,job_number,hubspot_deal_id,captured_at,source_sha256,snapshot)
 values(activity_id,project_id,act->'project'->>'id',identity->>'jobNumber',identity->>'dealId',(act->>'capturedAt')::timestamptz,p_payload->>'activityHash',act);
 insert into public.lab_project_costing_snapshots(activity_snapshot_id,resolved_at,source_sha256,evidence)
 values(activity_id,(cost->>'resolvedAt')::timestamptz,p_payload->>'costingHash',cost);
 insert into public.lab_project_sync_results(run_id,scope_id,project_id,outcome,code,activity_snapshot_id,missing_hours)
 values(p_run,p_scope,project_id,outcome,'IMPORTED',activity_id,(cost->'expected'->>'missingHours')::numeric);
 return project_id;
end $$;
create function public.lab_finish_project_sync(p_run uuid,p_failed boolean default false,p_code text default null) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.lab_project_sync_runs r set finished_at=now(),error_code=case when p_code ~ '^[A-Z_]{1,80}$' then p_code else null end,status=case when p_failed then 'failed' when r.mode='preview' then 'preview'
  when exists(select 1 from public.lab_project_sync_results where run_id=p_run and outcome='exception') then 'partial' else 'succeeded' end
 where id=p_run and status='running' and lease_until>now();
 if not found then raise exception 'Sync lease expired';end if;
end $$;
revoke all on function public.lab_claim_project_sync(text),public.lab_project_sync_scope(),public.lab_record_project_sync_result(uuid,uuid,text,text,text,jsonb),public.lab_apply_project_sync(uuid,uuid,jsonb),public.lab_finish_project_sync(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.lab_claim_project_sync(text),public.lab_project_sync_scope(),public.lab_record_project_sync_result(uuid,uuid,text,text,text,jsonb),public.lab_apply_project_sync(uuid,uuid,jsonb),public.lab_finish_project_sync(uuid,boolean,text) to service_role;
grant select,insert,update on public.projects to service_role;
grant select on public.ada_quote_workspaces,public.quote_workbook_revisions,public.lab_capacity_quote_versions to service_role;
-- PostgreSQL row locks require UPDATE privilege on at least one column.
-- The importer locks group membership while checking links; it does not edit groups.
grant update(group_id) on public.lab_capacity_quote_versions to service_role;
grant update on public.ada_quote_workspaces to service_role;
