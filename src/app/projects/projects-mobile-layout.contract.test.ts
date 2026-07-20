import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectsPath = path.join(process.cwd(), 'src', 'app', 'projects', 'page.tsx');

test('projects page has a compact mobile list and keeps the table as a desktop enhancement', () => {
  const source = readFileSync(projectsPath, 'utf8');

  assert.match(source, /@\/components\/ui\/page-shell/);
  assert.match(source, /<PageShell/);
  assert.match(source, /data-slot="projects-mobile-list"/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /hidden lg:block/);
  assert.match(source, /<Table/);
});
