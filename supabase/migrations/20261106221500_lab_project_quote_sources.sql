-- Lab-only pinned quote baselines. No integrations or operational release.
create table public.lab_project_quote_sources (
  project_id text primary key references public.projects(id),
  workspace_id uuid not null unique references public.ada_quote_workspaces(id),
  workbook_revision integer not null check (workbook_revision > 0),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  imported_at timestamptz not null default now(),
  foreign key (workspace_id, workbook_revision) references public.quote_workbook_revisions(workspace_id, revision)
);
alter table public.lab_project_quote_sources enable row level security;
revoke all on public.lab_project_quote_sources from anon, authenticated;
grant select on public.lab_project_quote_sources to authenticated;
grant all on public.lab_project_quote_sources to service_role;
create policy lab_project_sources_member_read on public.lab_project_quote_sources
  for select to authenticated using (
    exists (select 1 from public.quote_workspace_members m
      where m.workspace_id = lab_project_quote_sources.workspace_id
      and m.user_id = (select auth.uid()) and m.removed_at is null
      and m.email_normalized = lower((select auth.jwt())->>'email'))
  );
