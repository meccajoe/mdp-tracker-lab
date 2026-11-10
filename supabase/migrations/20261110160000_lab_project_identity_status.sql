-- Lab projections only: HubSpot owns identity; the current quote group head owns
-- project state. Saved quote documents and pinned financial baselines are untouched.
alter table public.ada_quote_workspaces add column job_number text;

create function public.lab_project_quote_head(p_project_id text) returns uuid
language sql volatile security invoker set search_path=pg_catalog,public as $$
  select w.id from public.lab_project_quote_sources s
  join public.lab_capacity_quote_versions origin on origin.workspace_id=s.workspace_id
  join public.lab_capacity_quote_versions v on v.group_id=origin.group_id
  join public.ada_quote_workspaces w on w.id=v.workspace_id
  where s.project_id=p_project_id and w.archived_at is null and w.lifecycle_status<>'archived'
  order by w.created_at desc,v.selected desc,w.id limit 1
$$;

create function public.lab_project_quote_status(p_project_id text) returns text
language sql volatile security invoker set search_path=pg_catalog,public as $$
  with latest as (
    select document from public.quote_workbook_revisions
    where workspace_id=public.lab_project_quote_head(p_project_id)
    order by revision desc limit 1
  ), state as (
    select document->'schedule'->>'projectStatus' explicit_status,
      coalesce(nullif(document->'planning'->>'status',''),document->'schedule'->>'status','') forecast
    from latest
  ) select case
    when forecast='Completed' then 'Completed'
    when forecast='In production' then 'Active'
    when explicit_status='Complete' then 'Completed'
    when explicit_status='Active' then 'Active'
    when explicit_status='Not Active' then 'Pending'
    when forecast='Closed won' then 'Active'
    else 'Pending' end from state
$$;

create function public.lab_sync_project_identity(p_project_id text) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare project_row public.projects; group_uuid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('lab-project:'||p_project_id,0));
  select p.* into project_row from public.projects p
    join public.lab_project_quote_sources s on s.project_id=p.id where p.id=p_project_id;
  if not found then return; end if;
  select v.group_id into group_uuid from public.lab_project_quote_sources s
    join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id where s.project_id=p_project_id;
  if group_uuid is null then return; end if;
  if (select count(*) from public.lab_project_quote_sources s join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id where v.group_id=group_uuid)>1 then
    raise exception 'Separate linked HubSpot jobs cannot share a quote version group.' using errcode='22023';
  end if;
  update public.ada_quote_workspaces w set tracker_project_id=null,hubspot_deal_id=null,job_number=null
    where w.tracker_project_id=p_project_id and not exists(select 1 from public.lab_capacity_quote_versions v where v.workspace_id=w.id and v.group_id=group_uuid);
  update public.ada_quote_workspaces w set title=project_row.name,job_number=project_row.job_number,
    tracker_project_id=p_project_id,hubspot_deal_id=project_row.hubspot_deal_id
    from public.lab_capacity_quote_versions v where v.workspace_id=w.id and v.group_id=group_uuid
    and (w.title,w.job_number,w.tracker_project_id,w.hubspot_deal_id) is distinct from
        (project_row.name,project_row.job_number,p_project_id,project_row.hubspot_deal_id);
end $$;

create function public.lab_project_projection_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare state text;
begin
  if exists(select 1 from public.lab_project_quote_sources s where s.project_id=new.id) then
    if current_user in ('authenticated','anon') and
      (new.name,new.job_number,new.hubspot_deal_id) is distinct from (old.name,old.job_number,old.hubspot_deal_id) then
      raise exception 'Linked project names and job numbers are managed by Refresh from HubSpot.' using errcode='22023';
    end if;
    state:=public.lab_project_quote_status(new.id);
    if state is not null then new.status:=state; end if;
  end if;
  return new;
end $$;
create trigger lab_project_projection_guard before update on public.projects
for each row execute function public.lab_project_projection_guard();

create function public.lab_linked_quote_identity_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare project_row public.projects;
begin
  if new.tracker_project_id is not null then
    select p.* into project_row from public.projects p join public.lab_project_quote_sources s on s.project_id=p.id where p.id=new.tracker_project_id;
    if found then
      if new.title is distinct from project_row.name and old.tracker_project_id=new.tracker_project_id then
        raise exception 'This project name is managed by HubSpot. Use Refresh from HubSpot.' using errcode='22023';
      end if;
      new.title:=project_row.name; new.job_number:=project_row.job_number; new.hubspot_deal_id:=project_row.hubspot_deal_id;
    end if;
  end if;
  return new;
end $$;
create trigger lab_linked_quote_identity_guard before update of title,job_number,tracker_project_id,hubspot_deal_id on public.ada_quote_workspaces
for each row execute function public.lab_linked_quote_identity_guard();

create function public.lab_project_identity_changed() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin perform public.lab_sync_project_identity(new.id); return new; end $$;
create trigger lab_project_identity_changed after update of name,job_number,hubspot_deal_id on public.projects
for each row execute function public.lab_project_identity_changed();

create function public.lab_quote_project_state_changed() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item record; old_group uuid; changed_workspace uuid;
begin
  if tg_table_name='lab_capacity_quote_versions' then
    if tg_op='UPDATE' then old_group:=old.group_id; end if;
    for item in select distinct s.project_id from public.lab_project_quote_sources s
      join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id
      where v.group_id=new.group_id or v.group_id=old_group
        or s.project_id=(select tracker_project_id from public.ada_quote_workspaces where id=new.workspace_id)
    loop
      perform public.lab_sync_project_identity(item.project_id);
      update public.projects set status=coalesce(public.lab_project_quote_status(item.project_id),status)
        where id=item.project_id and status is distinct from public.lab_project_quote_status(item.project_id);
    end loop;
  else
    if tg_table_name='ada_quote_workspaces' then changed_workspace:=new.id; else changed_workspace:=new.workspace_id; end if;
    for item in select distinct s.project_id from public.lab_project_quote_sources s
      join public.lab_capacity_quote_versions origin on origin.workspace_id=s.workspace_id
      join public.lab_capacity_quote_versions changed on changed.group_id=origin.group_id
      where changed.workspace_id=changed_workspace
    loop
      update public.projects set status=coalesce(public.lab_project_quote_status(item.project_id),status)
        where id=item.project_id and status is distinct from public.lab_project_quote_status(item.project_id);
    end loop;
  end if;
  return new;
end $$;
create trigger lab_quote_project_state_changed after insert on public.quote_workbook_revisions
for each row execute function public.lab_quote_project_state_changed();
create trigger lab_quote_group_project_changed after insert or update of group_id on public.lab_capacity_quote_versions
for each row execute function public.lab_quote_project_state_changed();
create trigger lab_quote_archive_project_changed after update of archived_at on public.ada_quote_workspaces
for each row execute function public.lab_quote_project_state_changed();

-- Only the trusted server can apply a verified read from the bound HubSpot deal.
create function public.apply_lab_hubspot_identity(p_project_id text,p_deal_id text,p_name text,p_job_number text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare project_row public.projects; original_titles jsonb; current_identity jsonb;
begin
  if p_name is null or btrim(p_name)='' or length(p_name)>300 or length(p_job_number)>60 then
    raise exception 'HubSpot returned an invalid project identity.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lab-project:'||p_project_id,0));
  if nullif(p_job_number,'') is not null then
    perform pg_advisory_xact_lock(hashtextextended('lab-job:'||p_job_number,0));
    if exists(select 1 from public.projects where job_number=p_job_number and id<>p_project_id) then
      raise exception 'This HubSpot job number is already linked to another Lab project.' using errcode='22023';
    end if;
  end if;
  select p.* into project_row from public.projects p join public.lab_project_quote_sources s on s.project_id=p.id
    where p.id=p_project_id for update of p;
  if not found or project_row.hubspot_deal_id is distinct from p_deal_id then
    raise exception 'The linked HubSpot deal changed. Reload before refreshing.' using errcode='22023';
  end if;
  select jsonb_object_agg(w.id::text,w.title) into original_titles from public.lab_project_quote_sources s
    join public.lab_capacity_quote_versions origin on origin.workspace_id=s.workspace_id
    join public.lab_capacity_quote_versions v on v.group_id=origin.group_id
    join public.ada_quote_workspaces w on w.id=v.workspace_id where s.project_id=p_project_id;
  current_identity:=jsonb_build_object('dealId',p_deal_id,'name',p_name,'jobNumber',nullif(p_job_number,''),'refreshedAt',now());
  update public.lab_project_quote_sources set snapshot=snapshot||jsonb_build_object(
    'original_workspace_titles',coalesce(original_titles,'{}')||coalesce(snapshot->'original_workspace_titles','{}'),
    'hubspot_identity',current_identity,
    'identity_history',coalesce(snapshot->'identity_history','[]')||jsonb_build_array(jsonb_build_object(
      'priorName',project_row.name,'priorJobNumber',project_row.job_number,'verifiedIdentity',current_identity)))
    where project_id=p_project_id;
  update public.projects set name=p_name,job_number=nullif(p_job_number,'') where id=p_project_id;
  perform public.lab_sync_project_identity(p_project_id);
  return current_identity;
end $$;
revoke all on function public.apply_lab_hubspot_identity(text,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_lab_hubspot_identity(text,text,text,text) to service_role;

-- Helpers are invokers: they add no privileges and respect existing actor RLS.
revoke all on function public.lab_project_quote_head(text),public.lab_project_quote_status(text),public.lab_sync_project_identity(text) from public,anon;
grant execute on function public.lab_project_quote_head(text),public.lab_project_quote_status(text),public.lab_sync_project_identity(text) to authenticated,service_role;
revoke all on function public.lab_project_projection_guard(),public.lab_linked_quote_identity_guard(),public.lab_project_identity_changed(),public.lab_quote_project_state_changed() from public,anon,authenticated;

-- Repair the imported project's stale operational state without editing a quote.
update public.projects p set status=public.lab_project_quote_status(p.id)
where public.lab_project_quote_status(p.id) is not null and p.status is distinct from public.lab_project_quote_status(p.id);
