\set ON_ERROR_STOP on
-- Bootstrap with lab-project-sync.database.sql in a fresh disposable database first.
do $$ begin if current_database() not like 'mdp_lab_identity_test%' then raise exception 'Disposable fixture required'; end if; end $$;
\ir ../supabase/migrations/20261110235032_lab_project_activity_snapshots.sql
set role service_role;
insert into lab_project_activity_snapshots(project_id,source_project_id,job_number,hubspot_deal_id,captured_at,source_sha256,snapshot)
 values('one','one','101','deal1','2026-11-01',repeat('a',64),'{"expenses":[{"id":"old"},{"id":"removed"}]}');
insert into lab_project_activity_snapshots(project_id,source_project_id,job_number,hubspot_deal_id,captured_at,source_sha256,snapshot)
 values('one','one','101','deal1','2026-11-02',repeat('b',64),'{"expenses":[{"id":"old"}]}');
insert into lab_project_activity_snapshots(project_id,source_project_id,job_number,hubspot_deal_id,captured_at,source_sha256,snapshot)
 values('one','one','101','deal1','2026-11-02',repeat('b',64),'{"expenses":[{"id":"old"}]}') on conflict(project_id,captured_at) do nothing;
do $$ begin
 if (select count(*) from lab_project_activity_snapshots)<>2 then raise exception 'Repeated capture duplicated'; end if;
 if (select jsonb_array_length(snapshot->'expenses') from lab_project_activity_snapshots where project_id='one' order by captured_at desc limit 1)<>1 then raise exception 'Latest capture did not reflect deletion'; end if;
 begin update lab_project_activity_snapshots set job_number='bad'; raise exception 'Server mutated audit history'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000009","email":"writer@example.com"}';
do $$ begin
 if (select count(*) from lab_project_activity_snapshots)<>2 then raise exception 'Member read denied'; end if;
 begin insert into lab_project_activity_snapshots(project_id) values('one'); raise exception 'Client write accepted'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000008","email":"outsider@example.com"}';
do $$ begin if (select count(*) from lab_project_activity_snapshots)<>0 then raise exception 'Nonmember read accepted'; end if; end $$;
reset role;
set role anon;
do $$ begin begin perform count(*) from lab_project_activity_snapshots; raise exception 'Anonymous read accepted'; exception when insufficient_privilege then null; end; end $$;
reset role;
select 'PASS: member RLS, nonmember and anonymous denial, client write denial, append-only server access, repeat capture, removed source rows' as evidence;
