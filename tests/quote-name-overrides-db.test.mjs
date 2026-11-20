import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const migration=readFileSync('supabase/migrations/20261011120000_lab_quote_management.sql','utf8');
const workbook=readFileSync('supabase/migrations/20260929012605_lab_quote_workbook_revisions.sql','utf8');
const owner='00000000-0000-4000-8000-000000000001',outsider='00000000-0000-4000-8000-000000000002';
const doc={schemaVersion:1,settings:{laborSell:110},lines:[]};
test('linked clone titles and rename survive canonical refresh without changing project or pricing',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.current_quote_actor_email() returns text language sql stable as $$select current_setting('test.email',true)$$;
 grant usage on schema auth to authenticated;
 create table ada_quote_workspaces(id uuid primary key default gen_random_uuid(),title text,client_name text,contact_name text,status text default 'draft',lifecycle_status text default 'draft');
 create table quote_workspace_members(workspace_id uuid references ada_quote_workspaces(id),user_id uuid,email_normalized text,workspace_role text,removed_at timestamptz);
 create table quote_user_capabilities(user_id uuid,email_normalized text,capability text,revoked_at timestamptz);
 grant select on ada_quote_workspaces,quote_workspace_members,quote_user_capabilities to authenticated;
 create function create_quote_workspace(p_title text,p_project uuid,p_client text,p_contact text,p_deal text) returns ada_quote_workspaces language plpgsql security definer as $$declare w ada_quote_workspaces;begin insert into ada_quote_workspaces(title,client_name,contact_name) values(p_title,p_client,p_contact) returning * into w;insert into quote_workspace_members values(w.id,auth.uid(),current_quote_actor_email(),'owner',null);return w;end;$$;
 insert into quote_user_capabilities values('${owner}','paul@meccadesign.com','create_workspace',null);`);
 await db.exec(workbook);await db.exec(migration);await db.exec(readFileSync('supabase/migrations/20261018140000_lab_final_forecast.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261011140000_lab_cad_turnover.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261021220000_lab_project_status.sql','utf8'));
 await db.exec('alter table ada_quote_workspaces add column archived_at timestamptz');
 await db.exec(readFileSync('supabase/migrations/20261026120000_lab_capacity_quote_versions.sql','utf8'));
 await db.exec(`alter table ada_quote_workspaces add column row_version integer default 0;
 create function append_quote_workflow_event(p_workspace_id uuid,p_revision_id uuid,p_event_type text,p_actor_email text,p_actor_role text,p_actor_capability text,p_expected_row_version integer,p_resulting_state text,p_reason text,p_evidence_refs jsonb,p_payload_json jsonb,p_idempotency_key text) returns void language plpgsql as $$begin
 if p_actor_role<>'owner' or p_actor_capability<>'archive_workspace' then raise exception 'Not authorized' using errcode='42501';end if;
 update ada_quote_workspaces set lifecycle_status=p_resulting_state,status='archived',archived_at=now(),row_version=row_version+1 where id=p_workspace_id;
 end;$$;`);
 await db.exec(readFileSync('supabase/migrations/20261026200000_lab_quote_capacity_unused_archive_lost.sql','utf8'));

 await db.exec(readFileSync('supabase/migrations/20261104120000_lab_won_final_clone_capacity.sql','utf8'));

 await db.exec(`create schema lab_project_internal;
 create table projects(id text primary key,name text,job_number text,hubspot_deal_id text);
 create table lab_project_quote_sources(project_id text,workspace_id uuid);
 alter table ada_quote_workspaces add column tracker_project_id text,add column job_number text,add column hubspot_deal_id text,add column last_activity_at timestamptz;
 create function quote_actor_has_workspace_capability(id uuid,email text,cap text) returns boolean language sql as $$select exists(select 1 from quote_workspace_members where workspace_id=id and user_id=auth.uid() and email_normalized=email and removed_at is null)$$;
 create function lab_project_internal.lab_linked_quote_identity_guard() returns trigger language plpgsql as $$begin return new;end$$;
 create trigger lab_linked_quote_identity_guard before update on ada_quote_workspaces for each row execute function lab_project_internal.lab_linked_quote_identity_guard();`);
 await db.exec(readFileSync('supabase/migrations/20261120120000_lab_quote_name_overrides.sql','utf8'));
 // Reproduce the existing version-group identity projection when a new clone joins.
 await db.exec(`create function test_group_sync() returns trigger language plpgsql security definer as $$begin perform lab_project_internal.lab_sync_project_identity(project_id) from lab_project_quote_sources;return new;end$$;
 create trigger test_group_sync after update of group_id on lab_capacity_quote_versions for each row execute function test_group_sync();`);
 async function actor(id=owner,email='paul@meccadesign.com'){await db.exec('reset role;set role authenticated;');await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,email]);}
 await actor();
 const a=(await db.query('select * from create_lab_quote($1,$2,null,$3,null,$4)',['Original','Client',doc,crypto.randomUUID()])).rows[0].id;
 await db.exec('reset role');
 await db.exec("insert into projects values('job','Official name','26254','deal')");await db.query("insert into lab_project_quote_sources values('job',$1)",[a]);
 await db.query("select lab_project_internal.lab_sync_project_identity('job')");
 await actor();
 const request=crypto.randomUUID();
 const clone=()=>db.query('select * from clone_lab_quote_version($1,$2,null,$3,$4,$5,1,true)',['My custom clone','Client',doc,request,a]);
 const c=(await clone()).rows[0];assert.equal(c.title,'My custom clone');assert.equal(c.tracker_project_id,'job');assert.equal((await clone()).rows[0].id,c.id);
 await db.query('select * from rename_quote_workspace($1,$2,$3)',[c.id,'paul@meccadesign.com','Renamed version']);
 await db.exec('reset role');await db.exec("update projects set name='Official refreshed';select lab_project_internal.lab_sync_project_identity('job');");
 assert.equal((await db.query('select title from ada_quote_workspaces where id=$1',[c.id])).rows[0].title,'Renamed version');
 assert.equal((await db.query('select title from ada_quote_workspaces where id=$1',[a])).rows[0].title,'Official refreshed');
 assert.equal((await db.query("select name from projects where id='job'")).rows[0].name,'Official refreshed');
 assert.deepEqual((await db.query('select document from quote_workbook_revisions where workspace_id=$1',[c.id])).rows[0].document,doc);
 await actor(outsider,'other@example.com');
 await assert.rejects(db.query('select * from rename_quote_workspace($1,$2,$3)',[c.id,'other@example.com','No']),e=>e.code==='42501');
 await actor();await db.exec('reset role');await db.query("update ada_quote_workspaces set lifecycle_status='archived' where id=$1",[c.id]);await actor();
 await assert.rejects(db.query('select * from rename_quote_workspace($1,$2,$3)',[c.id,'paul@meccadesign.com','No']),e=>e.code==='55000');
 }finally{await db.close();}
});
