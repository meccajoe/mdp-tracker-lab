// Run against disposable PostgreSQL via PGlite; never connects to hosted Supabase.
// PGLITE_MODULE may point to an externally installed @electric-sql/pglite module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migration = readFileSync(new URL('../supabase/migrations/20260929012605_lab_quote_workbook_revisions.sql', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/quote-v27/fonroche.json', import.meta.url))).quote;
const workspace = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const stranger = '00000000-0000-4000-8000-000000000003';

test('workbook RLS, append-only history, revision conflicts, and JSON persistence', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create function public.current_quote_actor_email() returns text language sql stable as $$ select current_setting('test.email',true) $$;
      grant usage on schema auth to authenticated;
      create table public.ada_quote_workspaces(id uuid primary key, lifecycle_status text not null);
      create table public.quote_workspace_members(workspace_id uuid,user_id uuid,email_normalized text,workspace_role text,removed_at timestamptz);
      alter table public.ada_quote_workspaces enable row level security;
      alter table public.quote_workspace_members enable row level security;
      grant select on public.ada_quote_workspaces, public.quote_workspace_members to authenticated;
      create policy self_read on quote_workspace_members for select to authenticated using(user_id=auth.uid() and email_normalized=current_quote_actor_email() and removed_at is null);
      create policy member_read on ada_quote_workspaces for select to authenticated using(exists(select 1 from quote_workspace_members m where m.workspace_id=id));
      insert into ada_quote_workspaces values('${workspace}','active');
      insert into quote_workspace_members values('${workspace}','${owner}','owner@example.test','owner',null);
    `);
    await db.exec(migration);
    async function actor(uid=owner, email='owner@example.test') {
      await db.exec('reset role; set role authenticated;');
      await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)",[uid,email]);
    }
    const save = (revision, document=fixture, author=owner) => db.query('insert into quote_workbook_revisions(workspace_id,revision,document,created_by,created_by_email) values($1,$2,$3,$4,$5) returning revision',[workspace,revision,JSON.stringify(document),author,'owner@example.test']);
    await actor();
    await save(1);
    const edited = structuredClone(fixture);
    edited.takeoffs[0].quantity=45; edited.lines[1].priceOverride=4000;
    await save(2,edited);
    const saved = await db.query('select revision,document from quote_workbook_revisions order by revision');
    assert.deepEqual(saved.rows.map(r=>r.revision),[1,2]);
    assert.deepEqual(saved.rows[0].document,fixture);
    assert.deepEqual(saved.rows[1].document,edited);
    await assert.rejects(save(2),e=>e.code==='PT409');
    await assert.rejects(save(4),e=>e.code==='PT409');
    await assert.rejects(save(3,fixture,stranger),e=>e.code==='42501');
    await assert.rejects(db.exec('update quote_workbook_revisions set revision=99'),e=>e.code==='42501');
    await assert.rejects(db.exec('delete from quote_workbook_revisions'),e=>e.code==='42501');
    await actor(stranger,'stranger@example.test');
    assert.equal((await db.query('select * from quote_workbook_revisions')).rows.length,0);
    await assert.rejects(save(1),e=>e.code==='42501');
    await actor(owner,'wrong@example.test');
    assert.equal((await db.query('select * from quote_workbook_revisions')).rows.length,0);
    await actor();
    await db.exec("reset role; update quote_workspace_members set workspace_role='viewer';");
    await actor();
    assert.equal((await db.query('select * from quote_workbook_revisions')).rows.length,2);
    await assert.rejects(save(3),e=>e.code==='42501');
    await db.exec("reset role; update quote_workspace_members set workspace_role='editor';");
    await actor(); await save(3);
    await db.exec("reset role; update ada_quote_workspaces set lifecycle_status='archived';");
    await actor();
    assert.equal((await db.query('select * from quote_workbook_revisions')).rows.length,3);
    await assert.rejects(save(4),e=>e.code==='42501');
    await db.exec('reset role; update quote_workspace_members set removed_at=now();');
    await actor();
    assert.equal((await db.query('select * from quote_workbook_revisions')).rows.length,0);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.exec('select * from quote_workbook_revisions'),e=>e.code==='42501');
    await db.exec('reset role; set role service_role;');
    assert.equal((await db.query('select * from quote_workbook_revisions')).rows.length,3);
    await assert.rejects(save(4),e=>e.code==='42501');
  } finally { await db.close(); }
});
