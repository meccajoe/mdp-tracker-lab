const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

// Execute the production modules with only external services replaced.
function load(file, dependencies, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, process: { env: {} }, Headers, ...globals }, { filename: file });
  return exports;
}
const next = { NextResponse: { json: (data, init) => Response.json(data, init) } };
function routeFixture({ token = 'valid', role = 'admin', cookie = false, dbError = false } = {}) {
  const calls = []; let reads = 0;
  const query = {};
  for (const name of ['select', 'order', 'range', 'eq', 'gte', 'lte']) {
    query[name] = (...args) => { calls.push([name, ...args]); return query; };
  }
  query.then = resolve => resolve({ data: [{ id: 'example' }], error: dbError ? { message: 'query failed' } : null });
  const service = { from: table => {
    if (table === 'user_roles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role } }) }) }) };
    assert.equal(table, 'project_pricing_index'); reads++; return query;
  } };
  const user = { email: 'admin@example.test' };
  const gate = load('src/lib/project-portfolio-server.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: cookie ? user : null }, error: null }) } }) },
    '@supabase/supabase-js': { createClient: (...args) => args.length === 2 ? service : { auth: { getUser: async bearer => {
      calls.push(['validate', bearer]); return { data: { user: bearer === token ? user : null }, error: bearer === token ? null : new Error('invalid') };
    } } } },
    'next/headers': { cookies: async () => ({ getAll: () => [], set() {} }) },
    'next/server': next,
    '@/lib/admin-access': load('src/lib/admin-access.ts', {}),
  });
  const route = load('src/app/api/pricing-intelligence/projects/route.ts', { 'next/server': next, '@/lib/project-portfolio-server': gate });
  return { calls, reads: () => reads, get: (bearer, params = '') => route.GET(new NextRequest('https://example.test/api/pricing-intelligence/projects' + params, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} })) };
}

test('actual GET validates browser bearer then reads index with filters and bounded page', async () => {
  const f = routeFixture(); const response = await f.get('valid', '?limit=500&offset=100&project_type=Retail&contract_min=10&contract_max=20');
  assert.equal(response.status, 200); assert.equal(f.reads(), 1);
  assert.ok(f.calls.some(x => x[0] === 'validate' && x[1] === 'valid'));
  assert.ok(f.calls.some(x => x[0] === 'range' && x[1] === 100 && x[2] === 199));
  for (const operation of ['eq', 'gte', 'lte']) assert.ok(f.calls.some(x => x[0] === operation));
});
test('anonymous rejected before financial read', async () => {
  const f = routeFixture(); assert.equal((await f.get()).status, 401); assert.equal(f.reads(), 0);
});
test('invalid or expired bearer cannot fall back to valid admin cookies', async () => {
  const f = routeFixture({ cookie: true }); assert.equal((await f.get('expired')).status, 401); assert.equal(f.reads(), 0);
});
test('ordinary signed-in user rejected before financial read', async () => {
  const f = routeFixture({ role: 'user' }); assert.equal((await f.get('valid')).status, 403); assert.equal(f.reads(), 0);
});
test('existing admin cookie access remains supported', async () => {
  const f = routeFixture({ cookie: true }); assert.equal((await f.get()).status, 200);
});
test('unsafe offset refused without financial query', async () => {
  const f = routeFixture(); assert.equal((await f.get('valid', '?offset=9007199254740992')).status, 400); assert.equal(f.reads(), 0);
});
test('query failure is not successful empty report', async () => {
  const f = routeFixture({ dbError: true }); assert.equal((await f.get('valid')).status, 500);
});
function clientFixture(responses) {
  const requests = [];
  const ada = load('src/lib/ada-client.ts', {
    '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-session' } } }) } } },
  }, { fetch: async (url, options) => { requests.push({ url, options }); return responses.shift(); } });
  const alias = load('src/lib/authenticated-fetch.ts', { '@/lib/ada-client': ada });
  const client = load('src/lib/pricing-projects-client.ts', { '@/lib/authenticated-fetch': alias });
  return { requests, client };
}
test('production client sends session on every page and retains more than 100 projects', async () => {
  const f = clientFixture([Response.json({ projects: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) }), Response.json({ projects: [{ id: 'last' }] })]);
  const result = await f.client.loadPricingProjects(); assert.equal(result.length, 101);
  assert.match(f.requests[1].url, /offset=100/);
  for (const { options } of f.requests) { assert.equal(options.headers.get('Authorization'), 'Bearer synthetic-session'); assert.equal(options.cache, 'no-store'); }
});
test('later page auth failure rejects partial report', async () => {
  const f = clientFixture([Response.json({ projects: Array(100).fill({ id: 'x' }) }), Response.json({ error: 'Authentication required' }, { status: 401 })]);
  await assert.rejects(() => f.client.loadPricingProjects(), /Authentication required/);
});
test('actual page consumes authenticated loader and clears stale rows on failure', () => {
  const page = fs.readFileSync('src/app/admin/pricing-intelligence/page.tsx', 'utf8');
  assert.match(page, /setProjects\(await loadPricingProjects\(\)\)/);
  assert.match(page, /catch \(error\) \{\s*setProjects\(\[\]\)/);
  assert.doesNotMatch(page, /from\("project_pricing_index"\)/);
});
