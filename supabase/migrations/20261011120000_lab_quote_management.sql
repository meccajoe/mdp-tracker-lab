-- Apply only to Tracker Lab gkvaeqlqrthztobxitvn. Does not rewrite existing quotes.
begin;
create table public.lab_quote_settings_revisions (
 revision integer primary key check(revision>0), document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<100000),
 created_by uuid not null,created_by_email text not null,created_at timestamptz not null default now()
);
alter table public.lab_quote_settings_revisions enable row level security;
revoke all on public.lab_quote_settings_revisions from public,anon,authenticated,service_role;
grant select,insert on public.lab_quote_settings_revisions to authenticated;
create policy quote_defaults_read on public.lab_quote_settings_revisions for select to authenticated using (public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com'));
create policy quote_defaults_append on public.lab_quote_settings_revisions for insert to authenticated with check (
 created_by=auth.uid() and created_by_email=public.current_quote_actor_email()
 and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
 and exists(select 1 from public.quote_user_capabilities c where c.user_id=auth.uid() and c.email_normalized=public.current_quote_actor_email() and c.capability='create_workspace' and c.revoked_at is null)
);
create function public.lab_quote_defaults_sequence() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare latest integer;
begin
 perform pg_advisory_xact_lock(610111200);
 select coalesce(max(revision),0) into latest from public.lab_quote_settings_revisions;
 if new.revision<>latest+1 then raise exception 'Global settings changed.' using errcode='PT409';end if;
 new.created_at:=now();return new;
end;$$;
revoke all on function public.lab_quote_defaults_sequence() from public,anon,authenticated,service_role;
create trigger quote_defaults_sequence before insert on public.lab_quote_settings_revisions for each row execute function public.lab_quote_defaults_sequence();

create table public.lab_quote_controls (
 workspace_id uuid primary key references public.ada_quote_workspaces(id),
 quote_status text not null default 'draft' check(quote_status in ('draft','final')),
 version integer not null default 0, modified_at timestamptz not null default now(),
 creation_request_id uuid unique,request_fingerprint text,created_by uuid,
 defaults_revision integer references public.lab_quote_settings_revisions(revision),
 cloned_from uuid references public.ada_quote_workspaces(id)
);
alter table public.lab_quote_controls enable row level security;
revoke all on public.lab_quote_controls from public,anon,authenticated,service_role;
grant select on public.lab_quote_controls to authenticated;
create policy quote_controls_read on public.lab_quote_controls for select to authenticated using(exists(select 1 from public.quote_workspace_members m where m.workspace_id=lab_quote_controls.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null));

create function public.set_lab_quote_status(p_workspace_id uuid,p_status text,p_expected_version integer,p_expected_revision integer) returns public.lab_quote_controls
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result public.lab_quote_controls;latest integer;
begin
 if p_expected_version is null or p_expected_version<0 or p_expected_revision is null or p_expected_revision<0 then raise exception 'Expected versions are required.' using errcode='22023';end if;
 if p_status not in ('draft','final') or p_status is null then raise exception 'Choose Draft or Final.' using errcode='22023';end if;
 if not exists(select 1 from public.quote_workspace_members m join public.ada_quote_workspaces w on w.id=m.workspace_id where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer') and w.lifecycle_status<>'archived') then raise exception 'Quote edit access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,27));
 select coalesce(max(revision),0) into latest from public.quote_workbook_revisions where workspace_id=p_workspace_id;
 if latest<>p_expected_revision or (p_status='final' and latest=0) then raise exception 'Save and reload the latest quote first.' using errcode='PT409';end if;
 insert into public.lab_quote_controls(workspace_id) values(p_workspace_id) on conflict do nothing;
 select * into result from public.lab_quote_controls where workspace_id=p_workspace_id for update;
 if result.version<>p_expected_version then raise exception 'Quote status changed.' using errcode='PT409';end if;
 update public.lab_quote_controls set quote_status=p_status,version=version+1,modified_at=now() where workspace_id=p_workspace_id returning * into result;
 return result;
end;$$;
revoke all on function public.set_lab_quote_status(uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.set_lab_quote_status(uuid,text,integer,integer) to authenticated;

-- Same per-workspace lock as append sequencing: finalization and saves cannot race.
create function public.lab_quote_final_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text,27));
 if exists(select 1 from public.lab_quote_controls where workspace_id=new.workspace_id and quote_status='final') then raise exception 'Switch this quote to Draft before editing.' using errcode='PT409';end if;
 return new;
end;$$;
revoke all on function public.lab_quote_final_guard() from public,anon,authenticated,service_role;
create trigger lab_quote_final_guard before insert on public.quote_workbook_revisions for each row execute function public.lab_quote_final_guard();

create function public.create_lab_quote(p_title text,p_client_name text,p_contact_name text,p_document jsonb,p_defaults_revision integer,p_request_id uuid,p_source_id uuid default null,p_source_revision integer default null) returns public.ada_quote_workspaces
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result public.ada_quote_workspaces;prior public.lab_quote_controls;latest integer;fingerprint text;source public.ada_quote_workspaces;
begin
 if public.current_quote_actor_email() not in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com') or auth.uid() is null then raise exception 'Quote access required.' using errcode='42501';end if;
 if not exists(select 1 from public.quote_user_capabilities c where c.user_id=auth.uid() and c.email_normalized=public.current_quote_actor_email() and c.capability='create_workspace' and c.revoked_at is null) then raise exception 'Quote creation access required.' using errcode='42501';end if;
 if nullif(btrim(p_title),'') is null or nullif(btrim(p_client_name),'') is null or length(p_title)>300 or length(p_client_name)>300 or p_request_id is null or jsonb_typeof(p_document) is distinct from 'object' then raise exception 'Client Name, Project Name and a workbook are required.' using errcode='22023';end if;
 fingerprint:=md5(jsonb_build_array(p_title,p_client_name,p_contact_name,p_document,p_defaults_revision,p_source_id,p_source_revision)::text);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,11));
 select * into prior from public.lab_quote_controls where creation_request_id=p_request_id;
 if found then
  if prior.created_by<>auth.uid() or prior.request_fingerprint<>fingerprint then raise exception 'Creation request changed.' using errcode='PT409';end if;
  select * into result from public.ada_quote_workspaces where id=prior.workspace_id;return result;
 end if;
 if p_source_id is not null then
  if not exists(select 1 from public.quote_workspace_members m where m.workspace_id=p_source_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null) then raise exception 'Source quote access required.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_source_id::text,27));
  select coalesce(max(revision),0) into latest from public.quote_workbook_revisions where workspace_id=p_source_id;
  if latest=0 or latest is distinct from p_source_revision then raise exception 'Source quote changed.' using errcode='PT409';end if;
 end if;
 if p_defaults_revision is not null then
  perform pg_advisory_xact_lock(610111200);
  select coalesce(max(revision),0) into latest from public.lab_quote_settings_revisions;
  if latest<>p_defaults_revision then raise exception 'Global settings changed.' using errcode='PT409';end if;
 end if;
 result:=public.create_quote_workspace(btrim(p_title),null,btrim(p_client_name),nullif(btrim(p_contact_name),''),null);
 insert into public.lab_quote_controls(workspace_id,creation_request_id,request_fingerprint,created_by,defaults_revision,cloned_from) values(result.id,p_request_id,fingerprint,auth.uid(),nullif(p_defaults_revision,0),p_source_id);
 insert into public.quote_workbook_revisions(workspace_id,revision,document,created_by,created_by_email) values(result.id,1,p_document,auth.uid(),public.current_quote_actor_email());
 return result;
end;$$;
revoke all on function public.create_lab_quote(text,text,text,jsonb,integer,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.create_lab_quote(text,text,text,jsonb,integer,uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';

commit;
