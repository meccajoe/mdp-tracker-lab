import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const expensesClientSource = fs.readFileSync(path.resolve('src/app/expenses/ExpensesClient.tsx'), 'utf8');
const projectDetailSource = fs.readFileSync(path.resolve('src/app/projects/[id]/page.tsx'), 'utf8');

const {
  getBillcomExpenseDisplayDetails,
} = await import(path.resolve('src/lib/billcom-expense-display.ts'));

test('Bill.com expense display details expose discreet identifiers for same-looking rows', () => {
  const details = getBillcomExpenseDisplayDetails({
    source: 'billcom',
    notes: 'Bill.com category: COS - Production : COS - Fabrication | Cardholder: Daniel Corona',
    external_id: 'txr_ddnmsois5t17d2jiqluu3vu1ts',
    synced_at: '2026-06-05T17:44:07.779+00:00',
  });

  assert.equal(details.isBillcom, true);
  assert.equal(details.cardholder, 'Daniel Corona');
  assert.equal(details.transactionIdShort, 'qluu3vu1ts');
  assert.equal(details.hasDiscreetDetails, true);
});

test('expenses page exposes a Bill.com details disclosure row instead of cluttering the main table', () => {
  assert.match(expensesClientSource, /Show Bill\.com details/);
  assert.match(expensesClientSource, /Bill\.com details/);
  assert.match(expensesClientSource, /Transaction ID/);
  assert.match(expensesClientSource, /Cardholder/);
});

test('project detail page exposes the same Bill.com disclosure metadata', () => {
  assert.match(projectDetailSource, /Show Bill\.com details/);
  assert.match(projectDetailSource, /Bill\.com details/);
  assert.match(projectDetailSource, /Transaction ID/);
  assert.match(projectDetailSource, /Cardholder/);
});
