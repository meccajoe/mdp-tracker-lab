\set ON_ERROR_STOP on
-- Run after the sync and activity fixtures, in a disposable local database only.
do $$ begin if current_database() not like 'mdp_lab_identity_test%' then raise exception 'Disposable fixture required'; end if; end $$;
\ir ../supabase/migrations/20261111224224_lab_project_costing_snapshots.sql
set role service_role;
insert into lab_project_costing_snapshots(activity_snapshot_id,resolved_at,source_sha256,evidence)
 select id,'2026-11-03',repeat('c',64),'{"fixture":"old"}'::jsonb from lab_project_activity_snapshots where captured_at='2026-11-02';
insert into lab_project_costing_snapshots(activity_snapshot_id,resolved_at,source_sha256,evidence)
 select id,'2026-11-04',repeat('d',64),'{"fixture":"new"}'::jsonb from lab_project_activity_snapshots where captured_at='2026-11-02';
insert into lab_project_costing_snapshots(activity_snapshot_id,resolved_at,source_sha256,evidence)
 select id,'2026-11-04',repeat('d',64),'{"fixture":"new"}'::jsonb from lab_project_activity_snapshots where captured_at='2026-11-02' on conflict(activity_snapshot_id,resolved_at) do nothing;
do $$ begin
 if (select count(*) from lab_project_costing_snapshots)<>2 then raise exception 'Repeat export duplicated'; end if;
 if (select evidence->>'fixture' from lab_project_costing_snapshots order by resolved_at desc limit 1)<>'new' then raise exception 'Latest export selection failed'; end if;
 begin update lab_project_costing_snapshots set evidence='{}'; raise exception 'Server update accepted'; exception when insufficient_privilege then null; end;
 begin delete from lab_project_costing_snapshots; raise exception 'Server delete accepted'; exception when insufficient_privilege then null; end;
 begin insert into lab_project_costing_snapshots(activity_snapshot_id,resolved_at,source_sha256,evidence) values(gen_random_uuid(),now(),repeat('a',64),'{}'); raise exception 'Unknown snapshot accepted'; exception when foreign_key_violation then null; end;
 if (select count(*) from lab_project_activity_snapshots)<>2 then raise exception 'Original captures changed'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000009","email":"writer@example.com"}';
do $$ begin
 if (select count(*) from lab_project_costing_snapshots)<>2 then raise exception 'Member read denied'; end if;
 begin insert into lab_project_costing_snapshots default values; raise exception 'Client insert accepted'; exception when insufficient_privilege then null; end;
 begin update lab_project_costing_snapshots set evidence='{}'; raise exception 'Client update accepted'; exception when insufficient_privilege then null; end;
 begin delete from lab_project_costing_snapshots; raise exception 'Client delete accepted'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000008","email":"outsider@example.com"}';
do $$ begin if (select count(*) from lab_project_costing_snapshots)<>0 then raise exception 'Nonmember read accepted'; end if; end $$;
reset role;
set role anon;
do $$ begin begin perform count(*) from lab_project_costing_snapshots; raise exception 'Anonymous read accepted'; exception when insufficient_privilege then null; end; end $$;
reset role;
select 'PASS: cost evidence member isolation, append-only grants, snapshot FK, history, latest selection and idempotency' as evidence;
