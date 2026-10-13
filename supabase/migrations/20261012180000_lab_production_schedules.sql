-- Tracker Lab only. Independent operational plans; commercial quotes remain untouched.
create table public.lab_production_schedule_revisions (
 workspace_id uuid not null references public.ada_quote_workspaces(id),
 revision integer not null check(revision>0),
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=1900000),
 created_by uuid not null, created_by_email text not null, created_at timestamptz not null default now(),
 primary key(workspace_id,revision)
);
alter table public.lab_production_schedule_revisions enable row level security;
revoke all on public.lab_production_schedule_revisions from public,anon,authenticated,service_role;
grant select,insert on public.lab_production_schedule_revisions to authenticated;
create policy production_schedule_read on public.lab_production_schedule_revisions for select to authenticated using (
 public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
 and exists(select 1 from public.quote_workspace_members m where m.workspace_id=lab_production_schedule_revisions.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null)
);
create policy production_schedule_append on public.lab_production_schedule_revisions for insert to authenticated with check (
 created_by=auth.uid() and created_by_email=public.current_quote_actor_email()
 and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
 and exists(select 1 from public.quote_workspace_members m join public.ada_quote_workspaces w on w.id=m.workspace_id where m.workspace_id=lab_production_schedule_revisions.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer') and w.lifecycle_status<>'archived')
);
create function public.check_production_schedule_revision() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare prior public.lab_production_schedule_revisions;
begin
 if new.created_by<>auth.uid() or new.created_by_email<>public.current_quote_actor_email() or public.current_quote_actor_email() not in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com') or not exists(select 1 from public.quote_workspace_members m join public.ada_quote_workspaces w on w.id=m.workspace_id where m.workspace_id=new.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer') and w.lifecycle_status<>'archived') then raise exception 'Schedule edit access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text,610121800));
 select * into prior from public.lab_production_schedule_revisions where workspace_id=new.workspace_id order by revision desc limit 1;
 if new.revision<>coalesce(prior.revision,0)+1 then raise exception 'Schedule changed; reload.' using errcode='PT409';end if;
 -- The first accepted baseline cannot be erased by later edits/recalculations.
 if prior.revision is not null and jsonb_array_length(coalesce(prior.document->'baseline','[]'::jsonb))>0 then
  new.document=jsonb_set(new.document,'{baseline}',prior.document->'baseline');
 end if;
 new.created_at=now();return new;
end;$$;
revoke all on function public.check_production_schedule_revision() from public,anon,authenticated;
create trigger production_schedule_revision before insert on public.lab_production_schedule_revisions for each row execute function public.check_production_schedule_revision();
