import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pageSource = fs.readFileSync(path.resolve('src/app/projects/[id]/page.tsx'), 'utf8');

test('BILL budget warning state uses plain-English PM link wording', () => {
  assert.match(pageSource, /created_with_member_warning/, 'warning status should still exist as an internal state');
  assert.match(pageSource, /Created — PM not linked/, 'chip should use plain-English PM link wording');
  assert.match(pageSource, /BILL budget created, but the PM was not added in BILL\./, 'toast should explain the real issue plainly');
  assert.doesNotMatch(pageSource, /Created with member warning/, 'old vague chip wording should be removed');
  assert.doesNotMatch(pageSource, /PM assignment needs attention\./, 'old vague toast wording should be removed');
});
