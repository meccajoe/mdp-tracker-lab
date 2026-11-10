\set ON_ERROR_STOP on
-- Run only in a fresh disposable database; never against a hosted project.
do $$ begin if current_database() not like 'mdp_lab_identity_test%' then raise exception 'Disposable identity fixture required'; end if; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
create table projects(id text primary key,name text,job_number text,hubspot_deal_id text,status text,contract_amount numeric);
create table ada_quote_workspaces(id uuid primary key,title text,tracker_project_id text,hubspot_deal_id text,archived_at timestamptz,lifecycle_status text default 'intake',created_at timestamptz);
create table lab_capacity_quote_versions(workspace_id uuid primary key,group_id uuid,selected boolean);
create table quote_workbook_revisions(workspace_id uuid,revision integer,document jsonb,primary key(workspace_id,revision));
create table quote_workspace_members(workspace_id uuid,user_id uuid,email_normalized text,removed_at timestamptz);
\ir ../supabase/migrations/20261106221500_lab_project_quote_sources.sql
insert into projects values('one','Imported name','101','deal1','Active',123.45),('two','Other job','102','deal2','Active',200);
insert into ada_quote_workspaces(id,title,created_at) values
 ('00000000-0000-4000-8000-000000000001','Old version','2026-01-01'),
 ('00000000-0000-4000-8000-000000000002','Newest version','2026-01-02'),
 ('00000000-0000-4000-8000-000000000004','Other job','2026-01-01');
insert into lab_capacity_quote_versions values
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',true),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',false),
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004',true);
insert into quote_workbook_revisions values
 ('00000000-0000-4000-8000-000000000001',1,'{"schedule":{"status":"Closed won","projectStatus":"Active"},"price":123.45}'),
 ('00000000-0000-4000-8000-000000000002',1,'{"schedule":{"status":"Closed won","projectStatus":"Complete"}}'),
 ('00000000-0000-4000-8000-000000000004',1,'{"schedule":{"status":"Closed won"}}');
insert into lab_project_quote_sources(project_id,workspace_id,workbook_revision,source_sha256,snapshot) values
 ('one','00000000-0000-4000-8000-000000000001',1,repeat('a',64),'{"totals":{"price":123.45}}'),
 ('two','00000000-0000-4000-8000-000000000004',1,repeat('b',64),'{"totals":{"price":200}}');
\ir ../supabase/migrations/20261110160000_lab_project_identity_status.sql
\ir ../supabase/migrations/20261110163000_lab_private_project_projections.sql
\ir ../supabase/migrations/20261110220209_lab_hubspot_refresh_read_permission.sql
-- Match hosted table grants: service_role does not implicitly own every table.
alter role service_role bypassrls;
grant select,update on projects,ada_quote_workspaces to service_role;
set role service_role;
select apply_lab_hubspot_identity('one','deal1','Server verified name','101');
reset role;
do $$ begin
 if (select name from projects where id='one')<>'Server verified name' then raise exception 'Server refresh failed'; end if;
 if (select status from projects where id='one')<>'Completed' or (select contract_amount from projects where id='one')<>123.45 then raise exception 'Server refresh changed status/budget'; end if;
 if has_function_privilege('authenticated','public.apply_lab_hubspot_identity(text,text,text,text)','execute') or has_function_privilege('anon','public.apply_lab_hubspot_identity(text,text,text,text)','execute') then raise exception 'Client can call identity refresh directly'; end if;
end $$;
do $$ begin if (select status from projects where id='one')<>'Completed' then raise exception 'Backfill ignored newest group head'; end if; end $$;
select apply_lab_hubspot_identity('one','deal1','Exact HubSpot name  ','101');
do $$ begin
 if (select count(*) from ada_quote_workspaces where tracker_project_id='one' and title='Exact HubSpot name  ' and job_number='101')<>2 then raise exception 'Canonical name/job did not reach versions'; end if;
 if (select snapshot->'totals'->>'price' from lab_project_quote_sources where project_id='one')<>'123.45' then raise exception 'Budget changed'; end if;
 if (select snapshot->'original_workspace_titles'->>'00000000-0000-4000-8000-000000000001' from lab_project_quote_sources where project_id='one')<>'Old version' then raise exception 'Original identity lost'; end if;
 if (select document->>'price' from quote_workbook_revisions where workspace_id='00000000-0000-4000-8000-000000000001' and revision=1)<>'123.45' then raise exception 'Quote document changed'; end if;
 begin perform apply_lab_hubspot_identity('one','wrong','Bad','101'); raise exception 'Wrong deal accepted'; exception when sqlstate '22023' then null; end;
 begin perform apply_lab_hubspot_identity('one','deal1','Bad','102'); raise exception 'Duplicate job accepted'; exception when sqlstate '22023' then null; end;
 begin update ada_quote_workspaces set title='Local rename' where id='00000000-0000-4000-8000-000000000001'; raise exception 'Local rename accepted'; exception when sqlstate '22023' then null; end;
 if has_function_privilege('authenticated','apply_lab_hubspot_identity(text,text,text,text)','EXECUTE') then raise exception 'Untrusted identity writer'; end if;
end $$;
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000002',2,'{"schedule":{"status":"Closed won","projectStatus":"Active"}}');
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000001',2,'{"schedule":{"projectStatus":"Complete"}}');
do $$ begin if (select status from projects where id='one')<>'Active' then raise exception 'Older version overrode current head'; end if; end $$;
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000002',3,'{"schedule":{"status":"Closed won","projectStatus":"Not Active"}}');
do $$ begin if (select status from projects where id='one')<>'Pending' then raise exception 'Not Active mapping failed'; end if; end $$;
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000002',4,'{"schedule":{"status":"Completed","projectStatus":"Active"}}');
do $$ begin if (select status from projects where id='one')<>'Completed' then raise exception 'Legacy Completed mapping failed'; end if; end $$;
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000002',5,'{"schedule":{"projectStatus":"Complete"},"planning":{"status":"In production"}}');
do $$ begin if (select status from projects where id='one')<>'Active' then raise exception 'Planning override mapping failed'; end if; end $$;
insert into ada_quote_workspaces(id,title,created_at) values('00000000-0000-4000-8000-000000000003','Clone custom name','2026-01-03');
insert into lab_capacity_quote_versions values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',false);
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000003',1,'{"schedule":{"projectStatus":"Complete"}}');
do $$ begin if (select status from projects where id='one')<>'Completed' or (select job_number from ada_quote_workspaces where id='00000000-0000-4000-8000-000000000003')<>'101' then raise exception 'Same-project clone inheritance failed'; end if; end $$;
update lab_capacity_quote_versions set group_id=workspace_id where workspace_id='00000000-0000-4000-8000-000000000003';
do $$ begin
 if (select tracker_project_id from ada_quote_workspaces where id='00000000-0000-4000-8000-000000000003') is not null or (select status from projects where id='one')<>'Active' then raise exception 'Separate quote retained linked job or stale state'; end if;
 begin update lab_capacity_quote_versions set group_id='00000000-0000-4000-8000-000000000001' where workspace_id='00000000-0000-4000-8000-000000000004'; raise exception 'Two jobs merged'; exception when sqlstate '22023' then null; end;
end $$;
update ada_quote_workspaces set archived_at=now(),lifecycle_status='archived' where id='00000000-0000-4000-8000-000000000002';
do $$ begin if (select status from projects where id='one')<>'Completed' then raise exception 'Archive failed to choose surviving head'; end if; end $$;
-- Exercise the real invoker trigger path under an authenticated quote writer.
create or replace function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
grant usage on schema auth to authenticated;
grant select on projects,ada_quote_workspaces,lab_capacity_quote_versions,quote_workbook_revisions,quote_workspace_members to authenticated;
grant insert on quote_workbook_revisions to authenticated;
grant update on projects,ada_quote_workspaces to authenticated;
insert into quote_workspace_members values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','writer@example.com',null);
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000009","email":"writer@example.com"}';
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000001',3,'{"schedule":{"status":"Closed won","projectStatus":"Active"}}');
do $$ begin
 if (select status from projects where id='one')<>'Active' then raise exception 'Actor trigger failed'; end if;
 begin update projects set name='Unauthorized rename' where id='one'; raise exception 'Local project rename accepted'; exception when sqlstate '22023' then null; end;
end $$;
update projects set status='Completed' where id='one';
do $$ begin if (select status from projects where id='one')<>'Active' then raise exception 'Project overrode quote status'; end if; end $$;
reset role;
-- A writer who cannot see a newer version must still respect its project state.
insert into ada_quote_workspaces(id,title,created_at) values('00000000-0000-4000-8000-000000000005','Private newer version','2026-01-04');
insert into lab_capacity_quote_versions values('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',false);
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000005',1,'{"schedule":{"status":"Closed won","projectStatus":"Active"}}');
alter table ada_quote_workspaces enable row level security;
alter table lab_capacity_quote_versions enable row level security;
alter table quote_workbook_revisions enable row level security;
create policy fixture_quote_visibility on ada_quote_workspaces for select to authenticated using(id='00000000-0000-4000-8000-000000000001');
create policy fixture_version_visibility on lab_capacity_quote_versions for select to authenticated using(workspace_id='00000000-0000-4000-8000-000000000001');
create policy fixture_revision_visibility on quote_workbook_revisions for all to authenticated using(workspace_id='00000000-0000-4000-8000-000000000001') with check(workspace_id='00000000-0000-4000-8000-000000000001');
set role authenticated;
insert into quote_workbook_revisions values('00000000-0000-4000-8000-000000000001',4,'{"schedule":{"status":"Closed won","projectStatus":"Complete"}}');
do $$ begin
 if (select count(*) from ada_quote_workspaces)<>1 then raise exception 'Partial-visibility fixture failed'; end if;
 if (select status from projects where id='one')<>'Active' then raise exception 'Partial visibility overrode the authoritative group head'; end if;
 if has_schema_privilege('authenticated','lab_project_internal','USAGE') then raise exception 'Client can access private projections'; end if;
end $$;
reset role;
select 'PASS: canonical identity, immutable budgets, exact whitespace, wrong deal, duplicate job, rename guard, group head, historical edits, legacy state, clone, split, conflicting jobs, archive, actor permissions and partial RLS visibility' evidence;
