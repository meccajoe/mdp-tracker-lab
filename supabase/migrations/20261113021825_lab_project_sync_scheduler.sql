-- Lab only. This dispatcher calls only the fixed authenticated Lab endpoint.
-- Enable after deploying matching CRON_SECRET and LAB_DAILY_SYNC_ENABLED=true.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function lab_project_internal.dispatch_project_sync(p_at timestamptz default now()) returns bigint
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare credential text;request_id bigint;
begin
 -- Both UTC slots are configured, but only Chicago's 06:00 hour dispatches.
 if extract(hour from p_at at time zone 'America/Chicago')<>6 then return null;end if;
 select decrypted_secret into credential from vault.decrypted_secrets where name='lab_project_sync_cron';
 if credential is null or length(credential)<32 then raise exception 'Lab sync scheduling credential is missing';end if;
 select net.http_get(
  url:='https://mdp-tracker-lab.vercel.app/api/lab-project-sync/scheduled',
  headers:=jsonb_build_object('Authorization','Bearer '||credential),
  timeout_milliseconds:=300000
 ) into request_id;
 return request_id;
end $$;
revoke all on function lab_project_internal.dispatch_project_sync(timestamptz) from public,anon,authenticated,service_role;
-- The cron owner is postgres; clients and the application role cannot dispatch.
do $$declare scheduled_job bigint;
begin
 select cron.schedule('mdp-lab-project-sync','0 11,12 * * *','select lab_project_internal.dispatch_project_sync();') into scheduled_job;
 perform cron.alter_job(job_id:=scheduled_job,active:=false);
end $$;
