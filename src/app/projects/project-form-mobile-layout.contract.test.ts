import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

for (const relativePath of ['src/app/projects/new/page.tsx', 'src/app/projects/[id]/edit/page.tsx']) {
  test(`${relativePath} uses single-column-first form grids`, () => {
    const source = readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    assert.doesNotMatch(source, /grid grid-cols-2 gap-4/);
    assert.match(source, /grid grid-cols-1 gap-4 sm:grid-cols-2/);
  });
}
