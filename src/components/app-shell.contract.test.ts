import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src');
const shellPath = path.join(root, 'components', 'AppShell.tsx');
const layoutPath = path.join(root, 'app', 'layout.tsx');

test('mobile-first shell owns responsive navigation and constrains main width', () => {
  assert.equal(existsSync(shellPath), true, 'expected a dedicated AppShell component');

  const shell = readFileSync(shellPath, 'utf8');
  const layout = readFileSync(layoutPath, 'utf8');

  assert.match(shell, /(md|xl):hidden/, 'expected an explicit compact-width navigation trigger');
  assert.match(shell, /role="dialog"|aria-modal/, 'expected a mobile navigation drawer/overlay');
  assert.match(shell, /min-w-0/, 'expected shrink-safe shell content');
  assert.match(shell, /max-w-full/, 'expected bounded shell content');
  assert.match(shell, /Sidebar/, 'expected shell to own desktop/mobile navigation rendering');

  assert.match(layout, /AppShell/, 'expected root layout to render AppShell');
  assert.doesNotMatch(layout, /<Sidebar\s*\/>/, 'root layout must not mount Sidebar directly');
});
