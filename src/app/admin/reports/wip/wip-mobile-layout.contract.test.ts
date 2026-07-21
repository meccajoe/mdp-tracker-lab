import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/app/admin/reports/wip/page.tsx'), 'utf8');

test('WIP report has a compact mobile project view and desktop accounting table', () => {
  assert.match(source, /@\/components\/ui\/page-shell/);
  assert.match(source, /data-slot="wip-mobile-list"/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /hidden lg:block/);
  assert.doesNotMatch(source, /container mx-auto py-8 px-4/);
});
