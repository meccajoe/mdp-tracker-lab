-- Preserve pre-link titles before canonical identity reaches a new quote group.
create or replace function public.lab_apply_project_sync(p_run uuid,p_scope uuid,p_payload jsonb) returns text
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
