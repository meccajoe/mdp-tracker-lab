import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('materials provide a mobile list and responsive detail headers', () => {
  assert.match(source('src/app/admin/materials/MaterialsClient.tsx'), /data-slot="materials-mobile-list"/);
  assert.match(source('src/app/admin/materials/MaterialsClient.tsx'), /hidden md:block/);
  assert.match(source('src/app/admin/materials/MaterialDetailClient.tsx'), /flex-col/);
  assert.match(source('src/app/admin/materials/MaterialDetailClient.tsx'), /flex-wrap/);
});

test('data entry and vendor forms stack before desktop widths', () => {
  const dataEntry = source('src/app/admin/data-entry/page.tsx');
  assert.match(dataEntry, /grid-cols-1 md:grid-cols-\[160px_80px_24px_1fr\]/);
  assert.match(dataEntry, /grid-cols-1 md:grid-cols-\[160px_1fr_80px_24px_1fr\]/);
  assert.match(dataEntry, /h-dvh/);
  assert.match(source('src/app/admin/vendors/page.tsx'), /flex flex-col gap-2[^\"]*sm:flex-row/);
});

test('Mission Control, settings flags, and line item search are mobile safe', () => {
  const missionControl = source('src/app/admin/mission-control/page.tsx');
  assert.match(missionControl, /Back to list/);
  assert.match(missionControl, /mobileDetailOpen \? 'hidden lg:block'/);
  assert.match(source('src/app/admin/settings/page.tsx'), /data-slot="settings-flags-table"/);
  const search = source('src/app/line-item-search/LineItemSearchClient.tsx');
  assert.match(search, /h-dvh/);
  assert.match(search, /w-\[min\(16rem,calc\(100vw-2rem\)\)\]/);
});
