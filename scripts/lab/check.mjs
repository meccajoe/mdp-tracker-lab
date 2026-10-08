import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Use Node 24; the tested version is pinned in .nvmrc.');
  process.exit(1);
}
const suites = [
  ['--experimental-strip-types', '--test', 'tests/quote-v27.test.mjs', 'tests/quote-v27-estimators.test.mjs', 'tests/lab-safety.test.mjs'],
  ['--import', 'tsx', '--test', 'tests/quote-v27-validation.test.ts', 'tests/quote-v27-blank.test.ts', 'tests/quote-takeoff-grid.test.ts', 'tests/quote-live-catalog.test.ts', 'tests/quote-edit-history.test.ts', 'tests/quote-reusable-items.test.ts', 'tests/capacity.test.ts'],
  ['--import', 'tsx', '--test', 'tests/quote-spreadsheet-import.test.ts'],
  ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'],
];
for (const args of suites) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}
console.log('Lab quote tests and TypeScript passed. Hosted authentication and save/reopen require separate verification.');
