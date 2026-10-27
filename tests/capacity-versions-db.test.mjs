import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const migration=readFileSync('supabase/migrations/20261011120000_lab_quote_management.sql','utf8');
const workbook=readFileSync('supabase/migrations/20260929012605_lab_quote_workbook_revisions.sql','utf8');
const owner='00000000-0000-4000-8000-000000000001',outsider='00000000-0000-4000-8000-000000000002';
const doc={schemaVersion:1,settings:{laborSell:110},lines:[]};
test('capacity version groups preserve quotes, serialize selection, guard permissions and select Closed Won',async()=>{
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

 async function actor(id=owner,email='paul@meccadesign.com'){await db.exec('reset role;set role authenticated;');await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,email]);}
 await actor();
 const create=async(key)=> (await db.query('select * from create_lab_quote($1,$2,null,$3,null,$4)',['Project','Client',doc,key])).rows[0].id;
 const a=await create('00000000-0000-4000-8000-000000000010'),b=await create('00000000-0000-4000-8000-000000000011');
 const row=async(id)=>(await db.query('select * from lab_capacity_quote_versions where workspace_id=$1',[id])).rows[0];
 const change=(id,action,target,version)=>db.query('select set_lab_capacity_version($1,$2,$3,$4)',[id,action,target,version]);
 assert.equal((await row(a)).selected,true);await change(b,'join',a,0);assert.equal((await row(b)).selected,false);assert.equal((await row(b)).group_id,(await row(a)).group_id);
 await change(b,'select',null,(await row(b)).version);assert.equal((await row(a)).selected,false);assert.equal((await row(b)).selected,true);
 await assert.rejects(change(a,'select',null,0),e=>e.code==='PT409');
 await db.query('insert into quote_workbook_revisions(workspace_id,revision,document,created_by,created_by_email) values($1,2,$2,$3,$4)',[a,{...doc,schedule:{status:'Closed won'}},owner,'paul@meccadesign.com']);
 assert.equal((await row(a)).selected,true);assert.equal((await row(b)).selected,false);
 await change(a,'unselect',null,(await row(a)).version);assert.equal((await row(a)).selected,false);assert.equal((await row(b)).selected,false);
 await change(a,'select',null,(await row(a)).version);

 const clone=async(mode)=>db.query('select * from clone_lab_quote_version($1,$2,null,$3,$4,$5,2,$6)',['New version','Client',doc,'00000000-0000-4000-8000-000000000012',a,mode]);
 const c=(await clone(true)).rows[0].id;assert.equal((await row(c)).selected,false);assert.equal((await row(c)).group_id,(await row(a)).group_id);assert.equal((await clone(true)).rows[0].id,c);await assert.rejects(clone(false),e=>e.code==='PT409');
 await change(c,'separate',null,(await row(c)).version);assert.equal((await row(c)).selected,true);assert.notEqual((await row(c)).group_id,(await row(a)).group_id);
 await assert.rejects(db.exec('update lab_capacity_quote_versions set selected=true'),e=>e.code==='42501');

 await db.query('insert into quote_workbook_revisions(workspace_id,revision,document,created_by,created_by_email) values($1,2,$2,$3,$4)',[b,{...doc,schedule:{status:'Lost'}},owner,'paul@meccadesign.com']);
 assert.equal((await db.query('select lifecycle_status from ada_quote_workspaces where id=$1',[b])).rows[0].lifecycle_status,'archived');
 assert.equal((await db.query('select document from quote_workbook_revisions where workspace_id=$1 and revision=1',[b])).rows[0].document.settings.laborSell,110);
 await actor(outsider,'outsider@example.test');assert.equal((await db.query('select * from lab_capacity_quote_versions')).rows.length,0);await assert.rejects(change(a,'select',null,3),e=>['42501','PT409'].includes(e.code));
 await db.exec('reset role');const count=(await db.query('select count(*)::int as n from quote_workbook_revisions')).rows[0].n;assert.equal(count,5);
 await db.exec('set role anon');await assert.rejects(db.exec('select * from lab_capacity_quote_versions'),e=>e.code==='42501');
 }finally{await db.close();}
});
