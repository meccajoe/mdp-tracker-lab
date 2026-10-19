import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const migration=readFileSync(new URL('../supabase/migrations/20261019173413_lab_reporting_server_reads.sql',import.meta.url),'utf8');
test('report server receives only SELECT; RLS, public and human grants remain unchanged',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role service_role bypassrls; create role anon; create role authenticated;');
  for(const name of ['lab_capacity_settings_revisions','lab_production_schedule_revisions','lab_team_schedule_revisions'])await db.exec(`create table public.${name}(revision integer,document jsonb);alter table public.${name} enable row level security;revoke all on public.${name} from public,anon,authenticated,service_role;grant select,insert on public.${name} to authenticated;`);
  await db.exec(migration);
  for(const name of ['lab_capacity_settings_revisions','lab_production_schedule_revisions','lab_team_schedule_revisions']){
   const result=await db.query(`select relrowsecurity from pg_class where oid='public.${name}'::regclass`);
   assert.equal(result.rows[0].relrowsecurity,true);
   await db.exec('set role service_role;');await db.exec(`select * from public.${name}`);
   await assert.rejects(db.exec(`insert into public.${name} values(1,'{}')`),e=>e.code==='42501');
   await assert.rejects(db.exec(`update public.${name} set revision=2`),e=>e.code==='42501');
   await assert.rejects(db.exec(`delete from public.${name}`),e=>e.code==='42501');
   await db.exec('reset role;set role anon;');await assert.rejects(db.exec(`select * from public.${name}`),e=>e.code==='42501');await db.exec('reset role;');
   const privileges=await db.query(`select has_table_privilege('authenticated','public.${name}','select') as read,has_table_privilege('authenticated','public.${name}','insert') as append,has_table_privilege('authenticated','public.${name}','update') as change`);
   assert.deepEqual(privileges.rows[0],{read:true,append:true,change:false});
  }
  await db.exec('alter table public.lab_team_schedule_revisions disable row level security;');
  await assert.rejects(db.exec(migration),/Expected RLS-protected/);
 }finally{await db.close();}
});
