-- Approved cost evidence is separate from immutable original time/expense captures.
create table public.lab_project_costing_snapshots(
 id uuid primary key default gen_random_uuid(),
 activity_snapshot_id uuid not null references public.lab_project_activity_snapshots(id),
 resolved_at timestamptz not null,
 imported_at timestamptz not null default now(),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 evidence jsonb not null check(jsonb_typeof(evidence)='object'),
 unique(activity_snapshot_id,resolved_at)
);
alter table public.lab_project_costing_snapshots enable row level security;
revoke all on public.lab_project_costing_snapshots from anon,authenticated,service_role;
grant select on public.lab_project_costing_snapshots to authenticated;
grant select,insert on public.lab_project_costing_snapshots to service_role;
create policy lab_project_costing_member_read on public.lab_project_costing_snapshots
 for select to authenticated using(exists(select 1 from public.lab_project_activity_snapshots a where a.id=activity_snapshot_id));
create index lab_project_costing_latest on public.lab_project_costing_snapshots(activity_snapshot_id,resolved_at desc);
