-- Lab only: future Closed Won transitions and newly cloned versions. No backfill.
begin;
create or replace function public.lab_capacity_closed_won() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare prior_status text; v integer; control_version integer;
begin
 if new.document->'schedule'->>'status'='Closed won' then
  select document->'schedule'->>'status' into prior_status from public.quote_workbook_revisions where workspace_id=new.workspace_id and revision<new.revision order by revision desc limit 1;
  if prior_status is distinct from 'Closed won' then
   perform pg_advisory_xact_lock(610261200);
   select version into v from public.lab_capacity_quote_versions where workspace_id=new.workspace_id;
   perform public.set_lab_capacity_version(new.workspace_id,'select',null,v);
   select version into control_version from public.lab_quote_controls where workspace_id=new.workspace_id;
   perform public.set_lab_quote_status(new.workspace_id,'final',coalesce(control_version,0),new.revision);
  end if;
 end if;return new;
end;$$;
-- Normalize only a newly won revision, before immutable revision storage.
create function public.lab_quote_won_active() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare prior_status text;
begin
 if new.document->'schedule'->>'status'='Closed won' then
  select document->'schedule'->>'status' into prior_status from public.quote_workbook_revisions where workspace_id=new.workspace_id order by revision desc limit 1;
  if prior_status is distinct from 'Closed won' then
   new.document:=jsonb_set(new.document,'{schedule,projectStatus}','"Active"'::jsonb);
  end if;
 end if;return new;
end;$$;
revoke all on function public.lab_quote_won_active() from public,anon,authenticated,service_role;
create trigger lab_quote_won_active before insert on public.quote_workbook_revisions for each row execute function public.lab_quote_won_active();
create or replace function public.clone_lab_quote_version(p_title text,p_client_name text,p_contact_name text,p_document jsonb,p_request_id uuid,p_source_id uuid,p_source_revision integer,p_same_project boolean) returns public.ada_quote_workspaces language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result public.ada_quote_workspaces; v integer; existed boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,11));
 select exists(select 1 from public.lab_quote_controls where creation_request_id=p_request_id) into existed;
 result:=public.create_lab_quote(p_title,p_client_name,p_contact_name,p_document,null,p_request_id,p_source_id,p_source_revision);
 if existed and (select clone_same_project from public.lab_capacity_quote_versions where workspace_id=result.id) is distinct from p_same_project then raise exception 'Clone mode changed. Start a new clone request.' using errcode='PT409';end if;
 if not existed then update public.lab_capacity_quote_versions set clone_same_project=p_same_project where workspace_id=result.id;end if;
 if p_same_project and not existed then
  select version into v from public.lab_capacity_quote_versions where workspace_id=result.id;
  perform public.set_lab_capacity_version(result.id,'join',p_source_id,v);
  select version into v from public.lab_capacity_quote_versions where workspace_id=result.id;
  perform public.set_lab_capacity_version(result.id,'select',null,v);
 end if;
 return result;
end;$$;
revoke all on function public.clone_lab_quote_version(text,text,text,jsonb,uuid,uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.clone_lab_quote_version(text,text,text,jsonb,uuid,uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
