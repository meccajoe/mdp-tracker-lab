-- Lab-only approvals fill missing source costs; never alter Production or raw time.
create table lab_project_internal.approved_hourly_rates (
 id uuid primary key default gen_random_uuid(),
 worker_id bigint not null check(worker_id>0),
 canonical_name text not null check(btrim(canonical_name)<>''),
 allowed_names text[] not null check(cardinality(allowed_names)>0),
 hourly_rate numeric not null check(hourly_rate>0),
 effective_start date not null,
 effective_end date check(effective_end is null or effective_end>=effective_start),
 approved_by text not null check(btrim(approved_by)<>''),
 approved_at timestamptz not null default now(),
 source_label text not null,
 source_refs text[] not null check(cardinality(source_refs)>0),
 revoked_at timestamptz
);
alter table lab_project_internal.approved_hourly_rates enable row level security;
revoke all on lab_project_internal.approved_hourly_rates from public,anon,authenticated,service_role;
grant select on lab_project_internal.approved_hourly_rates to service_role;
create policy lab_rate_service_read on lab_project_internal.approved_hourly_rates for select to service_role using(true);
create unique index lab_hourly_rate_active_worker_date on lab_project_internal.approved_hourly_rates(worker_id,effective_start) where revoked_at is null;
create function public.lab_project_rate_approvals() returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'workerId',worker_id,'canonicalName',canonical_name,'allowedNames',allowed_names,'hourlyRate',hourly_rate,
 'effectiveStart',effective_start,'effectiveEnd',effective_end,'approvedBy',approved_by,'approvedAt',approved_at,'sourceLabel',source_label,'sourceRefs',source_refs) order by worker_id,effective_start),'[]'::jsonb)
 from lab_project_internal.approved_hourly_rates where revoked_at is null
$$;
revoke all on function public.lab_project_rate_approvals() from public,anon,authenticated,service_role;
grant execute on function public.lab_project_rate_approvals() to service_role;
comment on table lab_project_internal.approved_hourly_rates is 'Lab-only historical assumptions approved by Joe, with payroll source evidence. Source approvals take precedence; original captures remain immutable.';
