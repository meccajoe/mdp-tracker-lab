import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const src = path.join(process.cwd(), 'src');
const pageShellPath = path.join(src, 'components', 'ui', 'page-shell.tsx');
const summaryGridPath = path.join(src, 'components', 'ui', 'summary-grid.tsx');
const dashboardPath = path.join(src, 'app', 'page.tsx');

test('mobile-first page primitives bound width and cap summary density', () => {
  assert.equal(existsSync(pageShellPath), true, 'expected a reusable PageShell primitive');
  assert.equal(existsSync(summaryGridPath), true, 'expected a reusable SummaryGrid primitive');

  const pageShell = readFileSync(pageShellPath, 'utf8');
  const summaryGrid = readFileSync(summaryGridPath, 'utf8');

  assert.match(pageShell, /w-full/);
  assert.match(pageShell, /min-w-0/);
  assert.match(pageShell, /max-w-full/);
  assert.match(summaryGrid, /grid-cols-1/);
  assert.match(summaryGrid, /sm:grid-cols-2/);
  assert.match(summaryGrid, /max-w-full/);
  assert.doesNotMatch(summaryGrid, /grid-cols-3|grid-cols-4/);
});

test('dashboard adopts the mobile-first page and summary primitives', () => {
  const dashboard = readFileSync(dashboardPath, 'utf8');

  assert.match(dashboard, /@\/components\/ui\/page-shell/);
  assert.match(dashboard, /@\/components\/ui\/summary-grid/);
  assert.match(dashboard, /<PageShell/);
  assert.match(dashboard, /<SummaryGrid/);
  assert.match(dashboard, /data-slot="dashboard-project-list"/);
  assert.match(dashboard, /data-slot="dashboard-expense-list"/);
  assert.match(dashboard, /lg:hidden/);
  assert.match(dashboard, /hidden lg:block/);
});
