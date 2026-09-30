// Disposable PostgreSQL only: actual repository lifecycle functions, synthetic auth stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const workflow = readFileSync('supabase/migrations/20260903102000_quote_workflow_events_and_outbox.sql', 'utf8');
const restore = readFileSync('supabase/migrations/20260910143000_quote_workspace_restore.sql', 'utf8');
const workbook = readFileSync('supabase/migrations/20260929012605_lab_quote_workbook_revisions.sql', 'utf8');
const document = JSON.parse(readFileSync('tests/fixtures/quote-v27/fonroche.json', 'utf8')).quote;
const id = '00000000-0000-4000-8000-000000000001';
const uid = '00000000-0000-4000-8000-000000000002';
function definition(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('AS $$', start)) + 3);
}

test('actual lifecycle SQL owner inverse, nonowner capabilities and archived write boundaries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create function current_quote_actor_email() returns text language sql stable as $$ select current_setting('test.email',true) $$;
      grant usage on schema auth to authenticated;
      create table ada_quote_workspaces(id uuid primary key, title text, lifecycle_status text, status text,
        archived_at timestamptz, row_version bigint default 1, last_activity_at timestamptz,
        current_revision_id uuid, commercial_approved_revision_id uuid, hubspot_published_revision_id uuid,
        customer_accepted_revision_id uuid, operationally_released_revision_id uuid);
      create table ada_quote_revisions(id uuid primary key,workspace_id uuid,normalization_status text,manifest_hash text,locked_at timestamptz);
      create table quote_workspace_members(workspace_id uuid,user_id uuid,email_normalized text,workspace_role text,removed_at timestamptz);
      create table quote_user_capabilities(user_id uuid,email_normalized text,capability text,revoked_at timestamptz);
      insert into ada_quote_workspaces(id,title,lifecycle_status,status) values('${id}','synthetic','draft','draft');
      insert into quote_workspace_members values('${id}','${uid}','owner@example.test','owner',null);
      grant select on ada_quote_workspaces,quote_workspace_members to authenticated;
    `);
    await db.exec(workflow.slice(workflow.indexOf('CREATE TABLE IF NOT EXISTS public.quote_workflow_events'), workflow.indexOf('CREATE INDEX IF NOT EXISTS idx_quote_workflow_events_workspace_time')));
    for (const name of ['is_quote_transition_allowed', 'required_quote_capability', 'quote_actor_has_workspace_capability', 'validate_quote_event_evidence', 'append_quote_workflow_event']) await db.exec(definition(workflow, name));
    // Apply actual restore migration, including grants and actor checks.
    await db.exec(restore); await db.exec(workbook);
    await db.exec('grant execute on function append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text) to authenticated;');
    const actor = async () => { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)", [uid, 'owner@example.test']); };
    const versionNow = async () => (await db.query('select row_version from ada_quote_workspaces')).rows[0].row_version;
    const archive = async (role='owner', version=null, key='archive') => db.query("select * from append_quote_workflow_event($1,null,'workspace_archived','owner@example.test',$2,'archive_workspace',$3,'archived','synthetic archive','[]','{\"previous_status\":\"draft\"}',$4)",[id,role,version ?? await versionNow(),key]);
    const restoreCall = async (version=null,key='restore') => db.query("select * from restore_quote_workspace($1,'owner@example.test',$2,'synthetic restore',$3)",[id,version ?? await versionNow(),key]);
    const save = revision => db.query('insert into quote_workbook_revisions(workspace_id,revision,document,created_by,created_by_email) values($1,$2,$3,$4,$5)',[id,revision,JSON.stringify(document),uid,'owner@example.test']);
    await actor(); await save(1); await archive();
    assert.equal((await db.query('select lifecycle_status from ada_quote_workspaces')).rows[0].lifecycle_status,'archived');
    await assert.rejects(save(2), e=>e.code==='42501');
    await assert.rejects(archive('owner',1,'stale'), e=>{ assert.equal(e.message, 'Stale Quote Workspace row version.'); assert.equal(e.code, '40001'); return true; });
    await restoreCall(); await save(2);
    assert.equal((await db.query('select archived_at from ada_quote_workspaces')).rows[0].archived_at,null);
    await assert.rejects(restoreCall(null,'not-archived'), e=>e.code==='55000');
    for (const role of ['viewer','editor','reviewer']) {
      await db.exec(`reset role; update quote_workspace_members set workspace_role='${role}';`); await actor();
      await assert.rejects(archive(role,null,role), e=>e.code==='42501');
      await assert.rejects(restoreCall(null,role), e=>e.code==='42501');
    }
    await db.exec(`reset role; insert into quote_user_capabilities values('${uid}','owner@example.test','archive_workspace',null);`); await actor();
    await archive('reviewer',null,'explicit-archive'); await restoreCall(null,'explicit-restore');
    await db.exec('reset role; update quote_user_capabilities set revoked_at=now();'); await actor();
    await assert.rejects(archive('reviewer',null,'revoked'),e=>e.code==='42501');
    await db.exec("reset role; update quote_workspace_members set workspace_role='owner',removed_at=now();"); await actor();
    await assert.rejects(archive('owner',null,'removed'),e=>e.code==='42501');
    await db.exec("reset role;");
    assert.equal((await db.query("select count(*)::int n from quote_workflow_events where event_type='workspace_archived'")).rows[0].n,2);
  } finally { await db.close(); }
});
