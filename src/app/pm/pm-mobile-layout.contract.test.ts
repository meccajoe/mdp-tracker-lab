import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const summary = readFileSync(path.join(process.cwd(), 'src/app/pm/page.tsx'), 'utf8');
const detail = readFileSync(path.join(process.cwd(), 'src/app/pm/[initials]/page.tsx'), 'utf8');

test('PM summary has a mobile rollup and desktop table', () => {
  assert.match(summary, /@\/components\/ui\/page-shell/);
  assert.match(summary, /data-slot="pm-rollup-mobile"/);
  assert.match(summary, /lg:hidden/);
  assert.match(summary, /hidden lg:block/);
});

test('PM detail has compact mobile project bonus rows and responsive stats', () => {
  assert.match(detail, /@\/components\/ui\/page-shell/);
  assert.match(detail, /data-slot="pm-bonus-mobile"/);
  assert.match(detail, /grid-cols-1/);
  assert.match(detail, /hidden lg:block/);
});
