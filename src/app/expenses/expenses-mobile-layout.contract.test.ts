import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/app/expenses/ExpensesClient.tsx'), 'utf8');

test('expenses uses a mobile page shell, wrapping actions, and responsive filters', () => {
  assert.match(source, /@\/components\/ui\/page-shell/);
  assert.match(source, /<PageShell/);
  assert.match(source, /sm:flex-row/);
  assert.match(source, /w-full sm:/);
});

test('expenses uses compact mobile rows and keeps the dense table desktop-only', () => {
  assert.match(source, /data-slot="expenses-mobile-list"/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /hidden lg:block/);
});
