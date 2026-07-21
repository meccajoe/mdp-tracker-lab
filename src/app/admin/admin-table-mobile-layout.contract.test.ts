import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

for (const [relativePath, slot] of [
  ['src/app/admin/users/page.tsx', 'users-mobile-list'],
  ['src/app/admin/flags/page.tsx', 'flags-mobile-list'],
  ['src/app/admin/reconciliation/page.tsx', 'reconciliation-mobile-list'],
]) {
  test(`${relativePath} provides a mobile card view and desktop table`, () => {
    const source = readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    assert.match(source, /@\/components\/ui\/page-shell/);
    assert.match(source, new RegExp(`data-slot="${slot}"`));
    assert.match(source, /hidden (?:md|lg):block/);
  });
}
