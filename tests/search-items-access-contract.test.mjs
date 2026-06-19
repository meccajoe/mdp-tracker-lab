import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sidebarSource = fs.readFileSync(path.resolve('src/components/Sidebar.tsx'), 'utf8');

test('Search Items nav link is available to all user roles, not only admins', () => {
  assert.match(sidebarSource, /href="\/line-item-search" label="Search Items"/);
  assert.doesNotMatch(
    sidebarSource,
    /\{effectiveIsAdmin && \(\s*<NavLink href="\/line-item-search" label="Search Items"/,
    'Search Items should not be wrapped in effectiveIsAdmin gating',
  );
});
