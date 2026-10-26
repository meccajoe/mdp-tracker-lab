-- Lab only. Explicit groups, never inferred from names. No workbook rewrites.
begin;
create table public.lab_capacity_quote_versions(
 workspace_id uuid primary key references public.ada_quote_workspaces(id),
 clone_same_project boolean, group_id uuid not null, selected boolean not null default true,
 version integer not null default 0, modified_at timestamptz not null default now()
);
create unique index lab_capacity_one_version on public.lab_capacity_quote_versions(group_id) where selected;
alter table public.lab_capacity_quote_versions enable row level security;
revoke all on public.lab_capacity_quote_versions from public,anon,authenticated,service_role;
grant select on public.lab_capacity_quote_versions to authenticated;
create policy capacity_versions_read on public.lab_capacity_quote_versions for select to authenticated using(exists(select 1 from public.quote_workspace_members m where m.workspace_id=lab_capacity_quote_versions.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null));
insert into public.lab_capacity_quote_versions(workspace_id,group_id) select id,id from public.ada_quote_workspaces;
create function public.lab_capacity_version_init() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$ begin
 insert into public.lab_capacity_quote_versions(workspace_id,group_id) values(new.id,new.id);return new;end;$$;
revoke all on function public.lab_capacity_version_init() from public,anon,authenticated,service_role;
create trigger capacity_version_init after insert on public.ada_quote_workspaces for each row execute function public.lab_capacity_version_init();
create function public.set_lab_capacity_version(p_workspace_id uuid,p_action text,p_target_id uuid,p_expected_version integer) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare source public.lab_capacity_quote_versions; destination uuid;
begin
 perform pg_advisory_xact_lock(610261200);
 select * into source from public.lab_capacity_quote_versions where workspace_id=p_workspace_id;
 if source.workspace_id is null or p_expected_version is null or source.version<>p_expected_version then raise exception 'Quote grouping changed. Reload and try again.' using errcode='PT409';end if;
 if p_action not in ('select','join','separate') then raise exception 'Invalid grouping action.' using errcode='22023';end if;
 destination:=source.group_id;
 if p_action='join' then select group_id into destination from public.lab_capacity_quote_versions where workspace_id=p_target_id;end if;
 if destination is null then raise exception 'Choose an existing project quote.' using errcode='22023';end if;
 if not exists(select 1 from public.ada_quote_workspaces where id=p_workspace_id and lifecycle_status<>'archived' and archived_at is null) then raise exception 'Restore the quote first.' using errcode='42501';end if;
 -- Changing a group affects every member's forecast; require edit access to all.
 if exists(select 1 from public.lab_capacity_quote_versions v where v.group_id in (source.group_id,destination) and not exists(select 1 from public.quote_workspace_members m where m.workspace_id=v.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer'))) then raise exception 'Edit access to all related versions is required.' using errcode='42501';end if;
 update public.lab_capacity_quote_versions set version=version+1,modified_at=now() where group_id in (source.group_id,destination);
 if p_action='select' then
  update public.lab_capacity_quote_versions set selected=false where group_id=source.group_id;
  update public.lab_capacity_quote_versions set selected=true where workspace_id=p_workspace_id;
 elsif p_action='join' and destination<>source.group_id then
  update public.lab_capacity_quote_versions set selected=false,group_id=destination where workspace_id=p_workspace_id;
 elsif p_action='separate' then
  update public.lab_capacity_quote_versions set group_id=gen_random_uuid(),selected=true where workspace_id=p_workspace_id;
 end if;
end;$$;
revoke all on function public.set_lab_capacity_version(uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.set_lab_capacity_version(uuid,text,uuid,integer) to authenticated;
-- All workbook save paths, including header forecast edits, select a newly won version atomically.
create function public.lab_capacity_closed_won() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare prior_status text; v integer;
begin
 if new.document->'schedule'->>'status'='Closed won' then
  select document->'schedule'->>'status' into prior_status from public.quote_workbook_revisions where workspace_id=new.workspace_id and revision<new.revision order by revision desc limit 1;
  if prior_status is distinct from 'Closed won' then
   perform pg_advisory_xact_lock(610261200);
   select version into v from public.lab_capacity_quote_versions where workspace_id=new.workspace_id;
   perform public.set_lab_capacity_version(new.workspace_id,'select',null,v);
  end if;
 end if;return new;
end;$$;
revoke all on function public.lab_capacity_closed_won() from public,anon,authenticated,service_role;
create trigger capacity_closed_won after insert on public.quote_workbook_revisions for each row execute function public.lab_capacity_closed_won();
-- Wrapper keeps creation and grouping in one transaction. Old clients remain separate by default.
create function public.clone_lab_quote_version(p_title text,p_client_name text,p_contact_name text,p_document jsonb,p_request_id uuid,p_source_id uuid,p_source_revision integer,p_same_project boolean) returns public.ada_quote_workspaces language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
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
 end if;
 return result;
end;$$;
revoke all on function public.clone_lab_quote_version(text,text,text,jsonb,uuid,uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.clone_lab_quote_version(text,text,text,jsonb,uuid,uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
