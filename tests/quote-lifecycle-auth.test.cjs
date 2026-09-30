const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Execute real route/guard/component code; replace only framework and service I/O.
const compiled = new Map();
function load(file, dependencies, env = {}) {
  const exports = {};
  const code = compiled.get(file) || ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  compiled.set(file, code);
  vm.runInNewContext(code, { exports, process: { env }, Request, Response, Headers, TextEncoder, Buffer,
    require: name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  }, { filename: file });
  return exports;
}
const policy = load('src/lib/quote-permissions.ts', {});
const next = { NextResponse: { json: (data, options) => Response.json(data, options) } };
const id = '00000000-0000-4000-8000-000000000001';
function fixture({ role = 'owner', lifecycle = 'draft', capabilities = [], member = true, capError = false, auth = true } = {}) {
  const calls = []; const filters = [];
  const actorClient = { rpc: (name, params) => {
    calls.push({ name, params });
    const result = { data: { event_id: 'synthetic-event' }, error: null };
    return name === 'restore_quote_workspace' ? { single: async () => result } : result;
  } };
  function query(table) {
    const q = {};
    for (const name of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'or'])
      q[name] = (...args) => { filters.push([table, name, ...args]); return q; };
    const result = () => ({ error: table === 'quote_user_capabilities' && capError ? { message: 'offline' } : null,
      data: table === 'user_roles' ? null : table === 'quote_workspace_members' ? (member ? [{ workspace_id: id, workspace_role: role }] : []) : table === 'quote_user_capabilities' ? capabilities.map(capability => ({ capability })) : [{ id, status: lifecycle === 'archived' ? 'archived' : 'draft', lifecycle_status: lifecycle, row_version: 2 }] });
    q.maybeSingle = async () => ({ ...result(), data: result().data?.[0] ?? null });
    q.then = resolve => resolve(result()); return q;
  }
  const service = { from: query };
  const identity = { id: 'synthetic-actor', email: 'joe@meccadesign.com' };
  const gate = load('src/lib/ada-server.ts', {
    '@supabase/ssr': { createServerClient: () => ({ ...actorClient, auth: { getUser: async () => ({ data: { user: null } }) } }) },
    '@supabase/supabase-js': { createClient: (_url, _key, options) => options ? { ...actorClient, auth: { getUser: async token => {
      assert.equal(token, 'synthetic-bearer'); return { data: { user: auth ? identity : null } };
    } } } : service },
    'next/headers': { cookies: async () => ({ getAll: () => [], set() {} }), headers: async () => new Headers(auth ? { Authorization: 'Bearer synthetic-bearer' } : {}) },
    'next/server': next, '@/lib/quote-permissions': policy,
    '@/lib/quote-product-access': load('src/lib/quote-product-access.ts', {}),
  });
  const ada = load('src/app/api/ada/workspaces/[workspaceId]/route.ts', { 'next/server': next, '@/lib/ada-server': gate });
  const routes = load('src/app/api/quote-workspaces/[workspaceId]/route.ts', { '@/app/api/ada/workspaces/[workspaceId]/route': ada, '@/lib/ada-server': gate });
  const restore = load('src/app/api/quote-workspaces/[workspaceId]/restore/route.ts', { 'next/server': next, '@/lib/ada-server': gate });
  const list = load('src/app/api/ada/workspaces/route.ts', { 'next/server': next, '@/lib/ada-server': gate, '@/lib/quote-permissions': policy });
  const prices = load('src/app/api/quote-workspaces/[workspaceId]/travel-prices/route.ts', {
    'next/server': next, '@/lib/ada-server': gate, '@/lib/lab-safety.mjs': { LAB_PROJECT_REF: 'gkvaeqlqrthztobxitvn' },
    '@/lib/travel-price-research': { parseTravelSearch: x => x, labTravelOffers: () => [] },
  }, { NEXT_PUBLIC_SUPABASE_URL: 'https://gkvaeqlqrthztobxitvn.supabase.co' });
  const request = () => new Request('https://lab.test/api', { method: 'POST', body: JSON.stringify({ departureDate: '2099-10-15' }) });
  const context = { params: Promise.resolve({ workspaceId: id }) };
  return { calls, filters, gate,
    archive: () => routes.DELETE(request(), context), restore: () => restore.POST(request(), context),
    prices: () => prices.POST(request(), context), list: () => list.GET({ nextUrl: new URL('https://lab.test/api') }),
  };
}

test('owner actual DELETE reaches governed archive RPC without explicit capability', async () => {
  const f = fixture(); assert.equal((await f.archive()).status, 200);
  assert.equal(f.calls[0].name, 'append_quote_workflow_event');
  assert.equal(f.calls[0].params.p_actor_role, 'owner');
  assert.equal(f.calls[0].params.p_actor_capability, 'archive_workspace');
  assert.ok(f.filters.some(x => x[0] === 'quote_workspace_members' && x[2] === 'user_id'));
  assert.ok(f.filters.some(x => x[0] === 'quote_workspace_members' && x[2] === 'email_normalized'));
});
test('owner restore reaches actual restore route RPC, unrelated approval stays denied', async () => {
  const f = fixture({ lifecycle: 'archived' }); assert.equal((await f.restore()).status, 200);
  assert.equal(f.calls[0].name, 'restore_quote_workspace');
  assert.equal((await f.gate.requireAdaWorkspaceAccess(id, 'approve_commercial')).response.status, 403);
});
for (const role of ['editor', 'reviewer', 'viewer']) test(`${role} lifecycle routes deny without explicit capability`, async () => {
  const f = fixture({ role }); assert.equal((await f.archive()).status, 403);
  assert.equal((await f.restore()).status, 403); assert.equal(f.calls.length, 0);
});
test('explicit nonowner capability retained; missing membership still fails closed', async () => {
  const f = fixture({ role: 'viewer', capabilities: ['archive_workspace'] }); assert.equal((await f.archive()).status, 200);
  const missing = fixture({ member: false, capabilities: ['archive_workspace'] });
  assert.equal((await missing.archive()).status, 404); assert.equal(missing.calls.length, 0);
});
test('anonymous and capability query failure cannot archive', async () => {
  assert.equal((await fixture({ auth: false }).archive()).status, 401);
  const f = fixture({ capError: true }); assert.equal((await f.archive()).status, 500); assert.equal(f.calls.length, 0);
});
test('archived owner cannot rearchive or lookup sample prices; viewer cannot lookup', async () => {
  const f = fixture({ lifecycle: 'archived' }); assert.equal((await f.archive()).status, 409);
  assert.equal((await f.prices()).status, 409); assert.equal(f.calls.length, 0);
  assert.equal((await fixture({ role: 'viewer' }).prices()).status, 403);
  assert.equal((await fixture().prices()).status, 200);
});
test('actual collection GET exposes per-membership actions and fails closed on query error', async () => {
  for (const [role, lifecycle, expected] of [
    ['owner', 'draft', { rename: true, archive: true, restore: false }],
    ['owner', 'archived', { rename: false, archive: false, restore: true }],
    ['viewer', 'draft', { rename: false, archive: false, restore: false }],
    ['editor', 'draft', { rename: true, archive: false, restore: false }],
  ]) {
    const response = await fixture({ role, lifecycle }).list(); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).workspaces[0].actions, expected);
  }
  assert.equal((await fixture({ capError: true }).list()).status, 500);
});
test('real action component renders only allowed lifecycle and rename controls', () => {
  const { QuoteActions } = load('src/components/quote-workspace-actions.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': { Archive: () => null, Pencil: () => null, RotateCcw: () => null },
    '@/components/ui/button': { Button: props => React.createElement('button', props) },
  });
  const render = (role, archived = false, capabilities = []) => renderToStaticMarkup(React.createElement(QuoteActions, {
    archived, busy: false, onRename() {}, onLifecycle() {},
    actions: policy.quoteWorkspaceActions({ email: 'actor@test', isActiveMember: true, workspaceRole: role, capabilities, systemRole: null }, archived ? 'archived' : 'draft'),
  }));
  assert.match(render('owner'), /Archive/); assert.match(render('owner'), /Rename/);
  assert.doesNotMatch(render('owner'), /Restore/);
  assert.match(render('owner', true), /Restore/); assert.doesNotMatch(render('owner', true), /Archive|Rename/);
  assert.equal(render('viewer'), ''); assert.equal(render('viewer', true), '');
  assert.match(render('editor'), /Rename/); assert.doesNotMatch(render('editor'), /Archive|Restore/);
  assert.match(render('viewer', false, ['archive_workspace']), /Archive/);
  assert.equal(renderToStaticMarkup(React.createElement(QuoteActions, { archived: false, busy: false, onRename() {}, onLifecycle() {} })), '');
});
test('removed member, blank email, admin role, revoked capability, and break-glass boundaries', () => {
  const actor = policy.buildQuoteActor({ email: 'joe@test', systemRole: 'admin', membership: { workspace_role: 'viewer', removed_at: null }, capabilities: [{ capability: 'archive_workspace', revoked_at: '2026-01-01' }] });
  assert.equal(policy.canPerformQuoteAction(actor, 'archive_workspace'), false);
  assert.equal(policy.canPerformQuoteAction({ ...actor, workspaceRole: 'owner', isActiveMember: false }, 'archive_workspace'), false);
  assert.equal(policy.canPerformQuoteAction({ ...actor, email: '', workspaceRole: 'owner' }, 'archive_workspace'), false);
  assert.equal(policy.canPerformQuoteAction({ ...actor, capabilities: ['break_glass'] }, 'archive_workspace'), false);
  assert.equal(policy.canPerformQuoteAction({ ...actor, capabilities: ['break_glass'], breakGlassReason: 'synthetic reason' }, 'archive_workspace'), true);
});
