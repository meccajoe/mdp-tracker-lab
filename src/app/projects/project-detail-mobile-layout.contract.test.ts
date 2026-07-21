import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const detailPath = path.join(process.cwd(), 'src', 'app', 'projects', '[id]', 'page.tsx');
const source = readFileSync(detailPath, 'utf8');

test('project detail uses the mobile page shell and responsive action headers', () => {
  assert.match(source, /@\/components\/ui\/page-shell/);
  assert.match(source, /<PageShell/);
  assert.match(source, /data-slot="project-budget-header"/);
  assert.match(source, /flex-col/);
  assert.match(source, /sm:flex-row/);
});

test('project detail keeps dense accounting tables inside local scroll regions', () => {
  for (const slot of [
    'project-budget-table',
    'project-quote-allocation-table',
    'project-expenses-table',
    'project-budget-detail-table',
    'project-labor-table',
  ]) {
    assert.match(source, new RegExp(`data-slot="${slot}"`), `missing ${slot}`);
  }
  assert.match(source, /overflow-x-auto/);
});
