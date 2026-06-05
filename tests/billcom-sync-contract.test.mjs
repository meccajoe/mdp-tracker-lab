import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const routePath = path.resolve('src/app/api/billcom/sync/route.ts');
const routeSource = fs.readFileSync(routePath, 'utf8');

const {
  shouldSyncBillcomTransaction,
  getBillcomOriginalAuthExternalIdsToDelete,
} = await import(path.resolve('src/lib/billcom-sync.ts'));

test('Bill.com sync only keeps settled CLEAR transactions', () => {
  assert.equal(
    shouldSyncBillcomTransaction({ transactionType: 'AUTHORIZATION', status: 'COMPLETE' }),
    false,
  );
  assert.equal(
    shouldSyncBillcomTransaction({ transactionType: 'CLEAR', status: 'PENDING' }),
    false,
  );
  assert.equal(
    shouldSyncBillcomTransaction({ transactionType: 'CLEAR', status: 'COMPLETE' }),
    true,
  );
});

test('Bill.com sync deletes the original auth row when a CLEAR arrives', () => {
  assert.deepEqual(
    getBillcomOriginalAuthExternalIdsToDelete({
      transactionType: 'CLEAR',
      originalAuthTransactionUuid: 'txr_auth_123',
    }),
    ['txr_auth_123'],
  );
  assert.deepEqual(
    getBillcomOriginalAuthExternalIdsToDelete({
      transactionType: 'CLEAR',
      originalAuthTransactionUuid: null,
    }),
    [],
  );
  assert.deepEqual(
    getBillcomOriginalAuthExternalIdsToDelete({
      transactionType: 'AUTHORIZATION',
      originalAuthTransactionUuid: 'txr_auth_123',
    }),
    [],
  );
});

test('route wires the Bill.com helper and original auth cleanup into the live sync path', () => {
  assert.match(routeSource, /shouldSyncBillcomTransaction\(tx\)/);
  assert.match(routeSource, /getBillcomOriginalAuthExternalIdsToDelete\(tx\)/);
  assert.match(routeSource, /\.in\("external_id", originalAuthExternalIds\)/);
});
