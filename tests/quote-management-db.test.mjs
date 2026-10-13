import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const migration=readFileSync('supabase/migrations/20261011120000_lab_quote_management.sql','utf8');
const workbook=readFileSync('supabase/migrations/20260929012605_lab_quote_workbook_revisions.sql','utf8');
const owner='00000000-0000-4000-8000-000000000001',outsider='00000000-0000-4000-8000-000000000002';
const doc={schemaVersion:1,settings:{laborSell:110},lines:[]};
test('quote management: atomic creation, frozen defaults, idempotency, cloning isolation, final locks and RLS',async()=>{
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
 await db.exec(workbook);await db.exec(migration);await db.exec(readFileSync('supabase/migrations/20261012180000_lab_production_schedules.sql','utf8'));
 async function actor(id=owner,email='paul@meccadesign.com'){await db.exec('reset role;set role authenticated;');await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,email]);}
 await actor();
 const defaults=(n)=>db.query('insert into lab_quote_settings_revisions values($1,$2,$3,$4,now())',[n,{settings:{laborSell:110+n}},owner,'paul@meccadesign.com']);
 await defaults(1);await assert.rejects(defaults(1),e=>e.code==='PT409');
 const create=(request,version=1,source=null,sourceVersion=null,document=doc)=>db.query('select * from create_lab_quote($1,$2,$3,$4,$5,$6,$7,$8)',['Project','Client',null,document,version,request,source,sourceVersion]);
 const key='00000000-0000-4000-8000-000000000010';const created=(await create(key)).rows[0],id=created.id;
 assert.equal((await create(key)).rows[0].id,id);assert.equal((await db.query('select * from quote_workbook_revisions')).rows.length,1);
 await assert.rejects(create(key,1,null,null,{...doc,changed:true}),e=>e.code==='PT409');
 await defaults(2);assert.equal((await db.query('select document from quote_workbook_revisions')).rows[0].document.settings.laborSell,110);
 await assert.rejects(create('00000000-0000-4000-8000-000000000011'),e=>e.code==='PT409');
 const clone=(await create('00000000-0000-4000-8000-000000000012',null,id,1)).rows[0];assert.notEqual(clone.id,id);
 const append=(workspace,revision=2)=>db.query('insert into quote_workbook_revisions(workspace_id,revision,document,created_by,created_by_email) values($1,$2,$3,$4,$5)',[workspace,revision,{...doc,edited:true},owner,'paul@meccadesign.com']);
 await append(clone.id);assert.equal((await db.query('select count(*)::int as n from quote_workbook_revisions where workspace_id=$1',[id])).rows[0].n,1);
 const status=(value,version=0,revision=1)=>db.query('select * from set_lab_quote_status($1,$2,$3,$4)',[id,value,version,revision]);
 await assert.rejects(status('final',0,0),e=>e.code==='PT409');await status('final');await assert.rejects(append(id),e=>e.code==='PT409');
 // Dedicated disposable Final fixture: operational progress never rewrites commercial history.
 const commercialBefore=JSON.stringify((await db.query('select revision,document from quote_workbook_revisions where workspace_id=$1 order by revision',[id])).rows);
 const task={id:'synthetic-task',itemId:'synthetic-item',item:'Synthetic acceptance',stage:'carpentry',trade:'Carpentry',hours:8,start:'2026-10-13',finish:'2026-10-13',daily:[{date:'2026-10-13',hours:8}],predecessors:[],locked:false};
 const plan={engine:'item-flow-1',quoteVersion:1,status:'approved',calendar:{saturday:false,sunday:false},rampDays:1,rules:{},tasks:[task],baseline:[task],actuals:{},notes:'Synthetic test only'};
 const saveSchedule=(revision,document)=>db.query('insert into lab_production_schedule_revisions(workspace_id,revision,document,created_by,created_by_email) values($1,$2,$3,$4,$5)',[id,revision,document,owner,'paul@meccadesign.com']);
 await saveSchedule(1,plan);await saveSchedule(2,{...plan,baseline:[],actuals:{[task.id]:{completed:'2026-10-14',hours:null,reason:'On plan',notes:'Synthetic completion only'}}});
 await assert.rejects(saveSchedule(2,plan),e=>e.code==='PT409');
 const progress=(await db.query('select document from lab_production_schedule_revisions where workspace_id=$1 and revision=2',[id])).rows[0].document;
 assert.equal(progress.actuals[task.id].completed,'2026-10-14');assert.equal(progress.actuals[task.id].hours,null);assert.deepEqual(progress.baseline,[task]);
 assert.equal((await db.query('select quote_status from lab_quote_controls where workspace_id=$1',[id])).rows[0].quote_status,'final');
 assert.equal(JSON.stringify((await db.query('select revision,document from quote_workbook_revisions where workspace_id=$1 order by revision',[id])).rows),commercialBefore);
 await assert.rejects(status('draft'),e=>e.code==='PT409');await status('draft',1);await append(id);
 // A failed initial revision rolls the workspace and request marker back together.
 await assert.rejects(create('00000000-0000-4000-8000-000000000013',2,null,null,{bad:true}));
 assert.equal((await db.query("select count(*)::int as n from lab_quote_controls where creation_request_id='00000000-0000-4000-8000-000000000013'")).rows[0].n,0);
 await actor(outsider,'outsider@example.test');assert.equal((await db.query('select * from lab_quote_controls')).rows.length,0);assert.equal((await db.query('select * from lab_quote_settings_revisions')).rows.length,0);await assert.rejects(status('final',2,2),e=>e.code==='42501');await assert.rejects(create('00000000-0000-4000-8000-000000000014',2),e=>e.code==='42501');
 await actor();await assert.rejects(db.exec("update lab_quote_controls set quote_status='final'"),e=>e.code==='42501');await assert.rejects(db.exec('delete from lab_quote_settings_revisions'),e=>e.code==='42501');
 await db.exec("reset role;update ada_quote_workspaces set lifecycle_status='archived' where id='"+id+"';");await actor();await assert.rejects(status('final',2,2),e=>e.code==='42501');
 }finally{await db.close();}
});
