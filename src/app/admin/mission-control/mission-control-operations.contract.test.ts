import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/app/admin/mission-control/page.tsx'), 'utf8');

test('native Mission Control creates and edits work items through the bridge', () => {
  assert.match(source, /New work item/);
  assert.match(source, /createWorkItem/);
  assert.match(source, /updateWorkItem/);
  assert.match(source, /bridge\/api\/work-items/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /method: 'PATCH'/);
});

test('native Mission Control shows separate activity and historical lookback', () => {
  assert.match(source, /Activity and history/);
  assert.match(source, /loadActivity/);
  assert.match(source, /bridge\/api\/activity/);
  assert.match(source, /scope === 'history'/);
});
