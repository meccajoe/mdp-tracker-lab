-- Lab-only: shared capacity roster/settings, separate from quote drafts.
create table public.lab_capacity_settings_revisions (
 revision integer primary key check(revision>0),
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=500000),
 created_by uuid not null,
 created_by_email text not null,
 created_at timestamptz not null default now()
);
alter table public.lab_capacity_settings_revisions enable row level security;
revoke all on public.lab_capacity_settings_revisions from public,anon,authenticated,service_role;
grant select,insert on public.lab_capacity_settings_revisions to authenticated;
create policy capacity_read on public.lab_capacity_settings_revisions for select to authenticated using (
 auth.uid() is not null and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
);
create policy capacity_append on public.lab_capacity_settings_revisions for insert to authenticated with check (
 created_by=auth.uid() and created_by_email=public.current_quote_actor_email()
 and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
 and exists(select 1 from public.quote_user_capabilities c where c.capability='create_workspace' and c.revoked_at is null
   and c.email_normalized=public.current_quote_actor_email() and (c.user_id is null or c.user_id=auth.uid()))
);
create function public.check_capacity_revision_sequence() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare latest integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(610051930);
 select coalesce(max(revision),0) into latest from public.lab_capacity_settings_revisions;
 if new.revision<>latest+1 then raise exception 'Capacity settings changed. Reload before saving.' using errcode='PT409'; end if;
 new.created_at:=now();return new;
end;
$$;
revoke all on function public.check_capacity_revision_sequence() from public,anon,authenticated;
create trigger capacity_revision_sequence before insert on public.lab_capacity_settings_revisions for each row execute function public.check_capacity_revision_sequence();
