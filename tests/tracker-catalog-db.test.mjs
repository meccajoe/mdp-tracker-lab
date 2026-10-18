// Disposable PostgreSQL only. No hosted connections or service credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const migration=readFileSync(new URL('../supabase/migrations/20261012010000_lab_materials_catalog.sql',import.meta.url),'utf8');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
test('shared catalog is atomic, deduplicated, versioned and permission protected',async()=>{
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
 await db.exec(readFileSync(new URL('../supabase/migrations/20261018120000_lab_catalog_soft_delete.sql',import.meta.url),'utf8'));
 async function actor(id=owner,email='paul@meccadesign.com'){await db.exec('reset role;set role authenticated;');await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[id,email]);}
 const write=async(action,payload)=>(await db.query('select lab_catalog_write($1,$2) as result',[action,JSON.stringify(payload)])).rows[0].result;
 await actor();await assert.rejects(write('add',{name:'New',unit:'each',unitCost:5}),e=>e.code==='PT409');
 await assert.rejects(write('import',{materials:[{name:'Good',unit:'each',unitCost:5},{name:'Bad',unit:'each',unitCost:-1}]}));
 assert.equal((await db.query('select * from lab_material_catalog')).rows.length,0);
 const imported=await write('import',{materials:[{name:'Panel',unit:'sheet',unitCost:20},{name:'Z Clips',unit:'',unitCost:null}],warnings:['Missing price']});assert.equal(imported.imported,2);
 assert.equal((await write('import',{materials:[{name:'Panel',unit:'sheet',unitCost:999}]})).alreadyImported,true);
 const duplicate=await write('add',{name:' panel ',unit:'each',unitCost:99});assert.equal(duplicate.created,false);assert.equal(Number(duplicate.entry.unit_cost),20);
 const added=await write('add',{name:'Custom panel',unit:'sheet',unitCost:17});assert.equal(added.entry.source,'Added from Takeoff');
 const edited=await write('edit',{itemId:added.entry.item_id,expectedVersion:1,name:'Custom panel',unit:'sheet',unitCost:22});assert.equal(edited.entry.revision,2);
 await assert.rejects(write('edit',{itemId:added.entry.item_id,expectedVersion:1,name:'Custom panel',unit:'sheet',unitCost:33}),e=>e.code==='PT409');
 assert.equal((await db.query('select * from lab_material_catalog_history')).rows.length,4);
 await assert.rejects(db.exec('delete from lab_material_catalog'),e=>e.code==='42501');
 await assert.rejects(db.exec("update lab_material_catalog set source='Google Sheet DB' where name='Custom panel'"));
 await assert.rejects(db.exec("insert into lab_material_catalog_history values(gen_random_uuid(),1,'{}')"),e=>e.code==='42501');
 const item=added.entry.item_id;
 const removed=(await db.query('select lab_catalog_set_deleted($1,2,true) as result',[item])).rows[0].result.entry;
 assert.equal(removed.revision,3);assert.ok(removed.deleted_at);assert.equal(Number(removed.unit_cost),22);
 await assert.rejects(db.query('select lab_catalog_set_deleted($1,2,false)',[item]),e=>e.code==='PT409');
 const restored=(await db.query('select lab_catalog_set_deleted($1,3,false) as result',[item])).rows[0].result.entry;
 assert.equal(restored.revision,4);assert.equal(restored.deleted_at,null);
 assert.equal((await db.query('select * from lab_material_catalog_history where item_id=$1',[item])).rows.length,4);
 await actor(other,'outsider@example.test');await assert.rejects(db.query('select lab_catalog_set_deleted($1,4,true)',[item]),e=>e.code==='42501');assert.equal((await db.query('select * from lab_material_catalog')).rows.length,0);await assert.rejects(write('add',{name:'Denied',unit:'each',unitCost:1}),e=>e.code==='42501');
 await actor(other,'joe@meccadesign.com');assert.equal((await db.query('select * from lab_material_catalog')).rows.length,3);await assert.rejects(write('add',{name:'Denied',unit:'each',unitCost:1}),e=>e.code==='42501');
 await db.exec('reset role;set role anon;');await assert.rejects(db.exec('select * from lab_material_catalog'),e=>e.code==='42501');
 }finally{await db.close();}
});
