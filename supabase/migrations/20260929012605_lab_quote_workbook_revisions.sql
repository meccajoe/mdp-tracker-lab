-- Lab-only workbook drafts. Existing governed quote revisions remain untouched.
create table public.quote_workbook_revisions (
  workspace_id uuid not null references public.ada_quote_workspaces(id),
  revision integer not null check (revision > 0),
  document jsonb not null check (
    jsonb_typeof(document) = 'object'
    and coalesce(document ->> 'schemaVersion' = '1', false)
    and octet_length(document::text) <= 2000000
  ),
  engine_version text not null default 'v27-1' check (engine_version = 'v27-1'),
  created_by uuid not null,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, revision)
);
alter table public.quote_workbook_revisions enable row level security;
revoke all on public.quote_workbook_revisions from public, anon, authenticated, service_role;
grant select, insert on public.quote_workbook_revisions to authenticated;
grant select on public.quote_workbook_revisions to service_role;

create policy workbook_member_read on public.quote_workbook_revisions
for select to authenticated using (
  exists (select 1 from public.quote_workspace_members m
    where m.workspace_id = quote_workbook_revisions.workspace_id
      and m.user_id = (select auth.uid())
      and m.email_normalized = (select public.current_quote_actor_email())
      and m.removed_at is null)
);
create policy workbook_editor_insert on public.quote_workbook_revisions
for insert to authenticated with check (
  created_by = (select auth.uid())
  and created_by_email = (select public.current_quote_actor_email())
  and exists (select 1 from public.quote_workspace_members m
    join public.ada_quote_workspaces w on w.id = m.workspace_id
    where m.workspace_id = quote_workbook_revisions.workspace_id
      and m.user_id = (select auth.uid())
      and m.email_normalized = (select public.current_quote_actor_email())
      and m.removed_at is null
      and m.workspace_role in ('owner', 'editor', 'reviewer')
      and w.lifecycle_status <> 'archived')
);

-- Serialize appends per workspace, including clients calling the Data API directly.
-- SECURITY INVOKER: the caller must pass the same table grants and RLS policies.
create function public.check_workbook_revision_sequence() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public, pg_temp
as $$
declare latest integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.workspace_id::text, 27));
  select coalesce(max(revision), 0) into latest
    from public.quote_workbook_revisions where workspace_id = new.workspace_id;
  if new.revision <> latest + 1 then
    raise exception 'This workbook has a newer revision. Reload before saving.' using errcode = 'PT409';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.check_workbook_revision_sequence() from public, anon, authenticated;
create trigger workbook_revision_sequence before insert on public.quote_workbook_revisions
for each row execute function public.check_workbook_revision_sequence();
comment on table public.quote_workbook_revisions is 'Append-only v27 lab drafts; not approved commercial revisions or publication records.';
