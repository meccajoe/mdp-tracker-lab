-- Full, dated snapshots; read only the newest capture, never sum captures.
create table public.lab_project_activity_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.lab_project_quote_sources(project_id),
  source_project_id text not null,
  job_number text not null,
  hubspot_deal_id text not null,
  captured_at timestamptz not null,
  imported_at timestamptz not null default now(),
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  unique(project_id,captured_at)
);
alter table public.lab_project_activity_snapshots enable row level security;
revoke all on public.lab_project_activity_snapshots from anon,authenticated,service_role;
grant select on public.lab_project_activity_snapshots to authenticated;
grant select,insert on public.lab_project_activity_snapshots to service_role;
create policy lab_project_activity_member_read on public.lab_project_activity_snapshots
  for select to authenticated using(exists(
    select 1 from public.lab_project_quote_sources s
    where s.project_id=lab_project_activity_snapshots.project_id
  ));
create index lab_project_activity_latest on public.lab_project_activity_snapshots(project_id,captured_at desc);
