-- Apply only to lab gkvaeqlqrthztobxitvn; preserves all existing quotes.
create table public.lab_prequote_revisions (
 item_id uuid not null,
 revision integer not null check(revision>0),
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=1900000),
 created_by uuid not null,
 created_by_email text not null,
 created_at timestamptz not null default now(),
 primary key(item_id,revision)
);
alter table public.lab_prequote_revisions enable row level security;
revoke all on public.lab_prequote_revisions from public,anon,authenticated,service_role;
grant select,insert on public.lab_prequote_revisions to authenticated;
create policy prequote_read on public.lab_prequote_revisions for select to authenticated using (
 auth.uid() is not null and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
);
create policy prequote_append on public.lab_prequote_revisions for insert to authenticated with check (
 created_by=auth.uid() and created_by_email=public.current_quote_actor_email()
 and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com')
 and exists(select 1 from public.quote_user_capabilities c where c.capability='create_workspace' and c.revoked_at is null
 and c.email_normalized=public.current_quote_actor_email() and (c.user_id is null or c.user_id=auth.uid()))
);
create function public.check_prequote_revision_sequence() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare latest integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.item_id::text,610061500));
 select coalesce(max(revision),0) into latest from public.lab_prequote_revisions where item_id=new.item_id;
 if new.revision<>latest+1 then raise exception 'Reusable item changed. Reload before saving.' using errcode='PT409';end if;
 new.created_at:=now();return new;
end;$$;
revoke all on function public.check_prequote_revision_sequence() from public,anon,authenticated;
create trigger prequote_revision_sequence before insert on public.lab_prequote_revisions for each row execute function public.check_prequote_revision_sequence();
create view public.lab_prequote_items with(security_invoker=true) as
 select distinct on(item_id) item_id,revision,document#>>'{lines,0,name}' as title,created_at
 from public.lab_prequote_revisions order by item_id,revision desc;
revoke all on public.lab_prequote_items from public,anon,authenticated,service_role;
grant select on public.lab_prequote_items to authenticated;
