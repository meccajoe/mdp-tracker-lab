-- Tracker Lab only. Names are independent of immutable quote amounts.
begin;
create table public.lab_per_diem_recipient_revisions (
 project_id text not null references public.projects(id),
 workspace_id uuid not null,
 workbook_revision integer not null,
 version integer not null check(version>0),
 names jsonb not null check(jsonb_typeof(names)='object' and octet_length(names::text)<=2000),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 primary key(project_id,workspace_id,workbook_revision,version),
 foreign key(workspace_id,workbook_revision) references public.quote_workbook_revisions(workspace_id,revision)
);
alter table public.lab_per_diem_recipient_revisions enable row level security;
revoke all on public.lab_per_diem_recipient_revisions from public,anon,authenticated,service_role;
grant select,insert on public.lab_per_diem_recipient_revisions to authenticated;
create policy per_diem_names_read on public.lab_per_diem_recipient_revisions for select to authenticated using (
 exists(select 1 from public.quote_workspace_members m where m.workspace_id=lab_per_diem_recipient_revisions.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null)
);
create policy per_diem_names_append on public.lab_per_diem_recipient_revisions for insert to authenticated with check (
 created_by=auth.uid() and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
 and exists(select 1 from public.lab_project_quote_sources s where s.project_id=lab_per_diem_recipient_revisions.project_id and s.workspace_id=lab_per_diem_recipient_revisions.workspace_id and s.workbook_revision=lab_per_diem_recipient_revisions.workbook_revision)
 and exists(select 1 from public.quote_workspace_members m where m.workspace_id=lab_per_diem_recipient_revisions.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer'))
);
create function public.lab_per_diem_names_sequence() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare latest integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.project_id,611082000));
 select coalesce(max(version),0) into latest from public.lab_per_diem_recipient_revisions where project_id=new.project_id and workspace_id=new.workspace_id and workbook_revision=new.workbook_revision;
 if new.version<>latest+1 then raise exception 'Recipient names changed. Reload before saving.' using errcode='PT409';end if;
 new.created_at:=now();return new;
end;$$;
revoke all on function public.lab_per_diem_names_sequence() from public,anon,authenticated,service_role;
create trigger per_diem_names_sequence before insert on public.lab_per_diem_recipient_revisions for each row execute function public.lab_per_diem_names_sequence();
commit;
