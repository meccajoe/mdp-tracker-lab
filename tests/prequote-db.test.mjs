// Disposable PostgreSQL only. No hosted connections or service credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const migration=readFileSync(new URL('../supabase/migrations/20261006150000_lab_prequote_library.sql',import.meta.url),'utf8');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
test('prequote items enforce authorized append-only history and revision conflicts',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.current_quote_actor_email() returns text language sql stable as $$select current_setting('test.email',true)$$;
 grant usage on schema auth to authenticated;
 create table quote_user_capabilities(user_id uuid,email_normalized text,capability text,revoked_at timestamptz);
 alter table quote_user_capabilities enable row level security;grant select on quote_user_capabilities to authenticated;
 create policy self_read on quote_user_capabilities for select to authenticated using(email_normalized=current_quote_actor_email() and (user_id is null or user_id=auth.uid()));
 insert into quote_user_capabilities values('${owner}','paul@meccadesign.com','create_workspace',null);`);
 await db.exec(migration);
 async function actor(id=owner,email='paul@meccadesign.com'){await db.exec('reset role;set role authenticated;');await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,email]);}
 const save=(revision,id=owner,email='paul@meccadesign.com')=>db.query("insert into lab_prequote_revisions(item_id,revision,document,created_by,created_by_email) values('00000000-0000-4000-8000-000000000099',$1,$2,$3,$4)",[revision,JSON.stringify({lines:[{name:'Cabinet'}]}),id,email]);
 await actor();await save(1);await save(2);assert.equal((await db.query('select * from lab_prequote_items')).rows[0].revision,2);assert.equal((await db.query('select * from lab_prequote_revisions')).rows.length,2);
 await assert.rejects(save(2),e=>e.code==='PT409');await assert.rejects(save(4),e=>e.code==='PT409');await assert.rejects(save(3,other),e=>e.code==='42501');
 await assert.rejects(db.exec('update lab_prequote_revisions set revision=5'),e=>e.code==='42501');await assert.rejects(db.exec('delete from lab_prequote_revisions'),e=>e.code==='42501');
 await actor(other,'outsider@example.test');assert.equal((await db.query('select * from lab_prequote_items')).rows.length,0);assert.equal((await db.query('select * from lab_prequote_revisions')).rows.length,0);await assert.rejects(save(1,other,'outsider@example.test'),e=>e.code==='42501');
 await actor(other,'joe@meccadesign.com');assert.equal((await db.query('select * from lab_prequote_revisions')).rows.length,2);await assert.rejects(save(3,other,'joe@meccadesign.com'),e=>e.code==='42501');
 await db.exec('reset role;update quote_user_capabilities set revoked_at=now();');await actor();await assert.rejects(save(3),e=>e.code==='42501');
 await db.exec('reset role;set role anon;');await assert.rejects(db.exec('select * from lab_prequote_revisions'),e=>e.code==='42501');await db.exec('reset role;set role service_role;');await assert.rejects(save(3),e=>e.code==='42501');
 }finally{await db.close();}
});
