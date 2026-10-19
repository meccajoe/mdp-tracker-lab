-- Lab-only shared named-person schedule. Quotes and project plans are untouched.
create table public.lab_team_schedule_revisions (
 revision integer primary key check(revision>0),
 status text not null check(status in ('proposed','approved')),
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=5000000),
 created_by uuid not null, created_by_email text not null,
 created_at timestamptz not null default now()
);
alter table public.lab_team_schedule_revisions enable row level security;
revoke all on public.lab_team_schedule_revisions from public,anon,authenticated,service_role;
grant select,insert on public.lab_team_schedule_revisions to authenticated;
create policy team_read on public.lab_team_schedule_revisions for select to authenticated using (
 auth.uid() is not null and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
 and not exists(select 1 from jsonb_array_elements(document->'sources'->'quotes') s where not exists (
 select 1 from public.quote_workspace_members m where m.workspace_id=(s->>'id')::uuid and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null))
);
create policy team_append on public.lab_team_schedule_revisions for insert to authenticated with check (
 created_by=auth.uid() and created_by_email=public.current_quote_actor_email()
 and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
 and exists(select 1 from public.quote_user_capabilities c where c.capability='create_workspace' and c.revoked_at is null and c.email_normalized=public.current_quote_actor_email() and (c.user_id is null or c.user_id=auth.uid()))
);
create function public.check_team_schedule_revision() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare prior public.lab_team_schedule_revisions; s jsonb; latest integer; ids jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(610181600);
 select * into prior from public.lab_team_schedule_revisions order by revision desc limit 1;
 if new.revision<>coalesce(prior.revision,0)+1 then raise exception 'Team schedule changed or access is incomplete.' using errcode='PT409'; end if;
 if new.document->>'engine' is distinct from 'team-daily-1' or jsonb_typeof(new.document->'sources'->'quotes') is distinct from 'array' then raise exception 'Invalid team schedule.';end if;
 -- A user cannot replace a shared schedule containing projects they cannot access.
 ids:=coalesce(prior.document->'sources'->'quotes','[]'::jsonb)||(new.document->'sources'->'quotes');
 for s in select value from jsonb_array_elements(ids) loop
  if not exists(select 1 from public.quote_workspace_members m where m.workspace_id=(s->>'id')::uuid and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null) then raise exception 'Incomplete project access.' using errcode='42501';end if;
 end loop;
 select coalesce(max(revision),0) into latest from public.lab_capacity_settings_revisions;
 if latest is distinct from (new.document->'sources'->>'roster')::integer then raise exception 'Roster changed.' using errcode='PT409';end if;
 for s in select value from jsonb_array_elements(new.document->'sources'->'quotes') loop
  select coalesce(max(revision),0) into latest from public.quote_workbook_revisions where workspace_id=(s->>'id')::uuid;
  if latest is distinct from (s->>'quote')::integer then raise exception 'Quote changed.' using errcode='PT409';end if;
  select coalesce(max(revision),0) into latest from public.lab_production_schedule_revisions where workspace_id=(s->>'id')::uuid;
  if latest is distinct from (s->>'plan')::integer then raise exception 'Project schedule changed.' using errcode='PT409';end if;
 end loop;
 if new.status='approved' and (prior.status is distinct from 'proposed' or new.document is distinct from prior.document) then raise exception 'Approve the unchanged latest proposal.' using errcode='PT409';end if;
 new.created_at:=now();return new;
end;
$$;
revoke all on function public.check_team_schedule_revision() from public,anon,authenticated;
create trigger team_revision_sequence before insert on public.lab_team_schedule_revisions for each row execute function public.check_team_schedule_revision();
