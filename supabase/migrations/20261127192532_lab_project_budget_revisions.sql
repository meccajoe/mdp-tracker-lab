-- Holds belong to the quote group so a new workspace version cannot bypass a hold.
create table public.lab_budget_holds (
 group_id uuid primary key,
 pending boolean not null,
 workspace_id uuid not null,
 revision integer not null,
 changed_by uuid not null,
 changed_at timestamptz not null default clock_timestamp()
);
alter table public.lab_budget_holds enable row level security;
revoke all on public.lab_budget_holds from public,anon,authenticated;
grant select,insert,update on public.lab_budget_holds to service_role;

create table public.lab_project_budget_revisions (
 id bigint generated always as identity primary key,
 project_id text not null references public.lab_project_quote_sources(project_id) on delete cascade,
 workspace_id uuid not null,
 workbook_revision integer not null,
 applied_at timestamptz not null default clock_timestamp(),
 budget jsonb not null,
 unique(project_id,workspace_id,workbook_revision)
);
alter table public.lab_project_budget_revisions enable row level security;
revoke all on public.lab_project_budget_revisions from public,anon,authenticated;
grant select on public.lab_project_budget_revisions to authenticated;
grant select,insert on public.lab_project_budget_revisions to service_role;
create policy lab_budget_revision_read on public.lab_project_budget_revisions for select to authenticated
 using (exists (select 1 from public.lab_project_quote_sources s where s.project_id=lab_project_budget_revisions.project_id));
create index lab_budget_revision_latest on public.lab_project_budget_revisions(project_id,id desc);

create function public.lab_quote_budget_control(p_workspace uuid,p_revision integer default null,p_pending boolean default null,p_actor uuid default null)
 returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare quote_group uuid; head uuid; latest integer; held boolean;
begin
 select group_id into quote_group from public.lab_capacity_quote_versions where workspace_id=p_workspace;
 if quote_group is null then raise exception 'Quote group missing' using errcode='PT409'; end if;
 if p_pending is not null then
  if p_actor is null then raise exception 'Actor required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lab-sync-group:'||quote_group::text,0));
  perform workspace_id from public.lab_capacity_quote_versions where group_id=quote_group for share;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,27));
  select w.id into head from public.lab_capacity_quote_versions v join public.ada_quote_workspaces w on w.id=v.workspace_id
   where v.group_id=quote_group and w.archived_at is null and w.lifecycle_status<>'archived'
   order by w.created_at desc,v.selected desc,w.id limit 1 for update of w;
  if head is distinct from p_workspace then raise exception 'Quote version changed' using errcode='PT409'; end if;
  select max(revision) into latest from public.quote_workbook_revisions where workspace_id=p_workspace;
  if latest is null or latest is distinct from p_revision then raise exception 'Saved revision changed' using errcode='PT409'; end if;
  insert into public.lab_budget_holds(group_id,pending,workspace_id,revision,changed_by)
   values(quote_group,p_pending,p_workspace,latest,p_actor)
   on conflict(group_id) do update set pending=excluded.pending,workspace_id=excluded.workspace_id,
    revision=excluded.revision,changed_by=excluded.changed_by,changed_at=clock_timestamp();
 end if;
 select pending into held from public.lab_budget_holds where group_id=quote_group;
 return jsonb_build_object('pending',coalesce(held,false));
end $$;
revoke all on function public.lab_quote_budget_control(uuid,integer,boolean,uuid) from public,anon,authenticated;
grant execute on function public.lab_quote_budget_control(uuid,integer,boolean,uuid) to service_role;

-- Compare budget and item data independently of quote metadata and item order.
create function lab_project_internal.budget_revision_values(budget jsonb) returns jsonb
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('totals',budget->'totals','lines',
  (select jsonb_agg(to_jsonb(l) order by l.id) from jsonb_to_recordset(budget#>'{budgetHandoff,lines}')
   as l(id text,name text,type text,"finalPrice" numeric,"hoursAllowed" numeric,"materialsBudget" numeric,
    "laborBudget" numeric,"buildBudget" numeric,"tradeHours" jsonb,"untypedHours" numeric)))
$$;
revoke all on function lab_project_internal.budget_revision_values(jsonb) from public,anon,authenticated;
grant execute on function lab_project_internal.budget_revision_values(jsonb) to service_role;

-- Preserve pre-link titles before canonical identity reaches a new quote group.
create or replace function public.lab_apply_project_sync(p_run uuid,p_scope uuid,p_payload jsonb) returns text
language plpgsql security invoker set search_path=pg_catalog,public as $$
#variable_conflict use_variable
declare
 w public.ada_quote_workspaces;identity jsonb:=p_payload->'identity';baseline jsonb:=p_payload->'baseline';
 project_id text;existing_id text;act jsonb:=p_payload->'activity';cost jsonb:=p_payload->'costing';
 budget jsonb:=p_payload->'currentBudget';prior_budget jsonb;held boolean;
 activity_id uuid:=(p_payload->>'activityId')::uuid;state text;outcome text;
begin
 perform id from public.lab_project_sync_runs where id=p_run and status='running' and mode<>'preview' and lease_until>now() for update;
 if not found then raise exception 'Sync lease expired or preview mode';end if;
 if exists(select 1 from public.lab_project_sync_results where run_id=p_run and scope_id=p_scope) then
  return (select r.project_id from public.lab_project_sync_results r where r.run_id=p_run and r.scope_id=p_scope);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('lab-sync-group:'||p_scope::text,0));
 perform workspace_id from public.lab_capacity_quote_versions where group_id=p_scope for share;
 -- Match the workbook writer's lock order: revision advisory lock, then workspace row.
 perform pg_advisory_xact_lock(hashtextextended((p_payload->>'workspaceId')::uuid::text,27));
 select a.* into w from public.ada_quote_workspaces a join public.lab_capacity_quote_versions v on v.workspace_id=a.id
 where v.group_id=p_scope and a.archived_at is null and a.lifecycle_status<>'archived'
 order by a.created_at desc,v.selected desc,a.id limit 1 for update of a;
 if not found or w.id::text<>p_payload->>'workspaceId' then raise exception 'Quote head changed';end if;
 select s.project_id into existing_id from public.lab_project_quote_sources s join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id where v.group_id=p_scope;
 if (select count(*) from public.lab_project_quote_sources s join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id where v.group_id=p_scope)>1 then raise exception 'Conflicting project group';end if;
 if existing_id is distinct from p_payload->>'expectedProjectId' then raise exception 'Project link changed';end if;
 select pending into held from public.lab_budget_holds where group_id=p_scope;
 if existing_id is null and coalesce(held,false) then
  raise exception 'Quote budget is Pending' using errcode='PT423';
 end if;
 if (identity->>'dealId') !~ '^\d+$' or (identity->>'jobNumber') !~ '^\d+$' or nullif(btrim(identity->>'name'),'') is null then raise exception 'Missing canonical identity';end if;
 perform pg_advisory_xact_lock(hashtextextended('lab-job:'||(identity->>'jobNumber'),0));
 perform pg_advisory_xact_lock(hashtextextended('lab-deal:'||(identity->>'dealId'),0));
 if exists(select 1 from public.projects p where (p.hubspot_deal_id=identity->>'dealId' or p.job_number=identity->>'jobNumber') and p.id is distinct from existing_id) then raise exception 'Identity conflict';end if;
 if existing_id is null then
  if (w.hubspot_deal_id is not null and w.hubspot_deal_id is distinct from identity->>'dealId') or (w.job_number is not null and w.job_number is distinct from identity->>'jobNumber') then raise exception 'Quote identity changed';end if;
  if p_payload ? 'expectedTitle' and w.title is distinct from p_payload->>'expectedTitle' then raise exception 'Quote title changed';end if;
  if (select revision from public.quote_workbook_revisions where workspace_id=w.id order by revision desc limit 1)<>(p_payload->>'revision')::integer
    or not exists(select 1 from public.quote_workbook_revisions where workspace_id=w.id and revision=(p_payload->>'revision')::integer and document=p_payload->'document') then raise exception 'Quote revision changed';end if;
  state:=coalesce(nullif(p_payload->'document'->'planning'->>'status',''),p_payload->'document'->'schedule'->>'status','');
  if state not in ('Closed won','In production','Completed') or (state='Closed won' and coalesce(nullif(p_payload->'document'->'schedule'->>'projectStatus',''),'Active') not in ('Active','Complete')) then raise exception 'Quote is not won Active or Complete';end if;
  state:=case when state='Completed' or (state='Closed won' and p_payload->'document'->'schedule'->>'projectStatus'='Complete') then 'Completed' else 'Active' end;
  if jsonb_typeof(baseline->'totals')<>'object' or jsonb_typeof(baseline->'lines')<>'array' or baseline->'totals'->>'price' is null then raise exception 'Invalid baseline';end if;
  project_id:='lab-'||w.id::text;
  insert into public.projects(id,name,client,pm,status,hubspot_deal_id,job_number,close_date,due_date)
   values(project_id,identity->>'name',coalesce(nullif(w.client_name,''),'Pending client'),coalesce(identity->>'pm',''),state,identity->>'dealId',identity->>'jobNumber',(identity->>'closeDate')::date,(identity->>'dueDate')::date);
  insert into public.lab_project_quote_sources(project_id,workspace_id,workbook_revision,source_sha256,snapshot)
   values(project_id,w.id,(p_payload->>'revision')::integer,p_payload->>'baselineHash',baseline||jsonb_build_object('original_workspace_titles',(select jsonb_object_agg(a.id::text,a.title) from public.ada_quote_workspaces a join public.lab_capacity_quote_versions v on v.workspace_id=a.id where v.group_id=p_scope)));
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
 -- Original source remains pinned. Publish only the verified current workbook budget.
 if budget is not null and budget<>'null'::jsonb and not coalesce(held,false)
  and exists(select 1 from public.projects p where p.id=project_id and p.status='Active') then
  if (select max(revision) from public.quote_workbook_revisions where workspace_id=w.id)
      is distinct from (p_payload->>'revision')::integer
    or not exists(select 1 from public.quote_workbook_revisions r where r.workspace_id=w.id
       and r.revision=(p_payload->>'revision')::integer and r.document=p_payload->'document') then
   raise exception 'Quote revision changed' using errcode='PT409';
  end if;
  select h.budget into prior_budget from public.lab_project_budget_revisions h where h.project_id=project_id order by h.id desc limit 1;
  if prior_budget is null then
   select s.snapshot into prior_budget from public.lab_project_quote_sources s where s.project_id=project_id;
  end if;
  if lab_project_internal.budget_revision_values(prior_budget)
    is distinct from lab_project_internal.budget_revision_values(budget) then
   insert into public.lab_project_budget_revisions(project_id,workspace_id,workbook_revision,budget)
   values(project_id,w.id,(p_payload->>'revision')::integer,budget)
   on conflict do nothing;
  end if;
 end if;
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

-- Keep the project list aligned with Budget Detail without loading full histories.
create view public.lab_current_project_budget_totals with (security_invoker=true) as
 select distinct on (project_id) project_id,workbook_revision,budget->'totals' as totals
 from public.lab_project_budget_revisions order by project_id,id desc;
revoke all on public.lab_current_project_budget_totals from public,anon,authenticated;
grant select on public.lab_current_project_budget_totals to authenticated;
