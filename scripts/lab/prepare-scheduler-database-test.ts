// Offline fixture generation. Execute only in a disposable mdp_lab_identity_test* DB.
import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2];if(!path)throw Error('Provide an output SQL path.');
const migration=readFileSync('supabase/migrations/20261113021825_lab_project_sync_scheduler.sql','utf8');
const extensions=migration.split('\n').filter(line=>line.startsWith('create extension '));
if(extensions.length!==2)throw Error('Review changed extension bootstrap.');
const routine=migration.split('\n').filter(line=>!line.startsWith('create extension ')).join('\n');
const setup=String.raw`
\set ON_ERROR_STOP on
do $$begin if current_database() not like 'mdp_lab_identity_test%' then raise exception 'Disposable database required';end if;end$$;
create schema lab_project_internal;
revoke all on schema lab_project_internal from public,anon,authenticated,service_role;
create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
insert into vault.decrypted_secrets values('lab_project_sync_cron',repeat('x',64));
create schema net;create table net.fixture_calls(id bigint generated always as identity,url text,headers jsonb,timeout_milliseconds integer);
create function net.http_get(url text,params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 2000) returns bigint language plpgsql as $$declare request_id bigint;begin
 insert into net.fixture_calls(url,headers,timeout_milliseconds) values(url,headers,timeout_milliseconds) returning id into request_id;return request_id;end$$;
create schema cron;create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$declare result bigint;begin
 insert into cron.job(jobname,schedule,command) values(p_name,p_schedule,p_command) returning jobid into result;return result;end$$;
create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null) returns void language plpgsql as $$begin
 update cron.job j set active=coalesce(alter_job.active,j.active) where j.jobid=job_id;end$$;
`;
const checks=String.raw`
do $$begin
 if (select count(*) from cron.job)<>1 or (select active from cron.job) or (select schedule from cron.job)<>'0 11,12 * * *' then raise exception 'Scheduler was not staged inactive';end if;
 if (select command from cron.job)<>'select lab_project_internal.dispatch_project_sync();' then raise exception 'Unexpected dispatch command';end if;
 perform lab_project_internal.dispatch_project_sync('2026-11-13T11:00:00Z');
 perform lab_project_internal.dispatch_project_sync('2026-07-13T12:00:00Z');
 if (select count(*) from net.fixture_calls)<>0 then raise exception 'Wrong Chicago hour dispatched';end if;
 perform lab_project_internal.dispatch_project_sync('2026-11-13T12:00:00Z');
 perform lab_project_internal.dispatch_project_sync('2026-07-13T11:00:00Z');
 perform lab_project_internal.dispatch_project_sync('2026-03-08T11:00:00Z');
 perform lab_project_internal.dispatch_project_sync('2026-11-01T12:00:00Z');
 if (select count(*) from net.fixture_calls)<>4 then raise exception 'Standard/daylight or transition-day timing incorrect';end if;
 if exists(select 1 from net.fixture_calls where url<>'https://mdp-tracker-lab.vercel.app/api/lab-project-sync/scheduled' or headers->>'Authorization'<>'Bearer '||repeat('x',64) or timeout_milliseconds<>300000) then raise exception 'Dispatch target/auth/timeout mismatch';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='lab_project_internal' and p.prosecdef) then raise exception 'Invoker boundary changed';end if;
 if has_function_privilege('authenticated','lab_project_internal.dispatch_project_sync(timestamptz)','execute') or has_function_privilege('anon','lab_project_internal.dispatch_project_sync(timestamptz)','execute') or has_function_privilege('service_role','lab_project_internal.dispatch_project_sync(timestamptz)','execute') then raise exception 'Client/application can dispatch';end if;
 delete from vault.decrypted_secrets;
 begin perform lab_project_internal.dispatch_project_sync('2026-11-13T12:00:00Z');raise exception 'Missing credential accepted';exception when raise_exception then if sqlerrm<>'Lab sync scheduling credential is missing' then raise;end if;end;
end$$;
select 'PASS: inactive staging, fixed target, secret use, timeout, DST and transition dates, invoker/client denial and missing credential' evidence;
`;
writeFileSync(path,setup+'\n'+routine+'\n'+checks,{mode:0o600});
