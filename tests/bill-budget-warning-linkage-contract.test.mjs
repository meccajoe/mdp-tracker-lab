import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const webhookSource = fs.readFileSync(path.resolve('src/app/api/webhooks/hubspot/route.ts'), 'utf8');

test('webhook persists BILL linkage fields even when create returns created_with_member_warning', () => {
  assert.match(webhookSource, /if \(seedResult\.status === "created" \|\| seedResult\.status === "created_with_member_warning"\)/, 'webhook should persist BILL linkage for warning-state creates too');
});
