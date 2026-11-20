-- Lab only: a quote/version title is distinct from its linked project's canonical identity.
-- Existing quotes retain their names; explicit rename/clone names persist through refresh.
begin;
alter table public.ada_quote_workspaces add column quote_title_override text
 check (quote_title_override is null or (length(btrim(quote_title_override)) between 1 and 300));
create or replace function lab_project_internal.lab_sync_project_identity(p_project_id text) returns void
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
  update public.ada_quote_workspaces w set title=coalesce(w.quote_title_override,project_row.name),job_number=project_row.job_number,
    tracker_project_id=p_project_id,hubspot_deal_id=project_row.hubspot_deal_id
    from public.lab_capacity_quote_versions v where v.workspace_id=w.id and v.group_id=group_uuid
    and (w.title,w.job_number,w.tracker_project_id,w.hubspot_deal_id) is distinct from
        (coalesce(w.quote_title_override,project_row.name),project_row.job_number,p_project_id,project_row.hubspot_deal_id);
end $$;
create or replace function lab_project_internal.lab_linked_quote_identity_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare project_row public.projects;
begin
  if current_setting('role',true)='authenticated' and auth.uid() is null then
    raise exception 'Authenticated quote actor required.' using errcode='42501';
  end if;
  if new.tracker_project_id is not null then
    select p.* into project_row from public.projects p join public.lab_project_quote_sources s on s.project_id=p.id where p.id=new.tracker_project_id;
    if found then
      if new.title is distinct from coalesce(new.quote_title_override,project_row.name) and old.tracker_project_id=new.tracker_project_id then
        raise exception 'This project name is managed by HubSpot. Use Refresh from HubSpot.' using errcode='22023';
      end if;
      new.title:=coalesce(new.quote_title_override,project_row.name); new.job_number:=project_row.job_number; new.hubspot_deal_id:=project_row.hubspot_deal_id;
    end if;
  end if;
  return new;
end $$;
drop trigger lab_linked_quote_identity_guard on public.ada_quote_workspaces;
create trigger lab_linked_quote_identity_guard before update of title,quote_title_override,job_number,tracker_project_id,hubspot_deal_id on public.ada_quote_workspaces
for each row execute function lab_project_internal.lab_linked_quote_identity_guard();
CREATE OR REPLACE FUNCTION public.rename_quote_workspace(
  p_workspace_id uuid,
  p_actor_email text,
  p_title text
)
RETURNS public.ada_quote_workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_actor text := lower(btrim(p_actor_email));
  workspace_lifecycle text;
  updated_workspace public.ada_quote_workspaces;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor
     OR NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Workspace rename capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL OR length(p_title)>300 THEN
    RAISE EXCEPTION 'Quote title is required.' USING ERRCODE = '22023';
  END IF;

  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.ada_quote_workspaces
  SET title = btrim(p_title), quote_title_override = btrim(p_title), last_activity_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO updated_workspace;
  RETURN updated_workspace;
END;
$$;
create or replace function public.clone_lab_quote_version(p_title text,p_client_name text,p_contact_name text,p_document jsonb,p_request_id uuid,p_source_id uuid,p_source_revision integer,p_same_project boolean) returns public.ada_quote_workspaces language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result public.ada_quote_workspaces; v integer; existed boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,11));
 select exists(select 1 from public.lab_quote_controls where creation_request_id=p_request_id) into existed;
 result:=public.create_lab_quote(p_title,p_client_name,p_contact_name,p_document,null,p_request_id,p_source_id,p_source_revision);
 if existed and (select clone_same_project from public.lab_capacity_quote_versions where workspace_id=result.id) is distinct from p_same_project then raise exception 'Clone mode changed. Start a new clone request.' using errcode='PT409';end if;
 if not existed then update public.ada_quote_workspaces set quote_title_override=btrim(p_title),title=btrim(p_title) where id=result.id;end if;
 if not existed then update public.lab_capacity_quote_versions set clone_same_project=p_same_project where workspace_id=result.id;end if;
 if p_same_project and not existed then
  select version into v from public.lab_capacity_quote_versions where workspace_id=result.id;
  perform public.set_lab_capacity_version(result.id,'join',p_source_id,v);
  select version into v from public.lab_capacity_quote_versions where workspace_id=result.id;
  perform public.set_lab_capacity_version(result.id,'select',null,v);
 end if;
 select * into result from public.ada_quote_workspaces where id=result.id;
 return result;
end;$$;
notify pgrst,'reload schema';
commit;
