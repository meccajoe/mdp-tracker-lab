import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const webhookSource = fs.readFileSync(path.resolve('src/app/api/webhooks/hubspot/route.ts'), 'utf8');

test('webhook persists BILL linkage fields for every successful create-or-attach status, including roster warnings', () => {
  assert.match(webhookSource, /if \(isBillBudgetLinkSuccess\(seedResult\.status\)\)/, 'webhook should persist BILL linkage for every centralized success status');
});
