require('dotenv').config({ path: '.env.local' });

const API_TOKEN=proces...onst BASE_URL = process.env.BILLCOM_BASE_URL || 'https://gateway.prod.bill.com/connect';

async function fetchPage(params) {
  const url = new URL(BASE_URL + '/v3/spend/transactions');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { apiToken: API_TOKEN, Accept: 'application/json' } });
  if (!res.ok) throw new Error('Bill.com API ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return res.json();
}

(async () => {
  const result = await fetchPage({ pageSize: '10', transactionType: 'CLEAR' });

  if (!result.results.length) {
    console.log('No CLEAR transactions returned');
    return;
  }

  // Print full raw object of first transaction to see ALL fields
  console.log('=== FULL TRANSACTION OBJECT (first CLEAR) ===');
  console.log(JSON.stringify(result.results[0], null, 2));

  // Print all unique top-level keys across all transactions
  const allKeys = new Set();
  for (const tx of result.results) Object.keys(tx).forEach(k => allKeys.add(k));
  console.log('\n=== ALL FIELDS PRESENT ACROSS ALL TRANSACTIONS ===');
  console.log([...allKeys].sort().join(', '));

  // Check for any status/approval/receipt related fields
  console.log('\n=== STATUS/APPROVAL FIELDS ACROSS ALL TRANSACTIONS ===');
  const statusFields = ['status', 'approvalStatus', 'receiptStatus', 'state', 'reviewStatus',
    'isApproved', 'approved', 'needsApproval', 'receiptRequired', 'flagged', 'hold',
    'pendingApproval', 'coding', 'codingStatus', 'expenseStatus'];
  for (const tx of result.results) {
    const found = {};
    for (const f of statusFields) {
      if (tx[f] !== undefined) found[f] = tx[f];
    }
    if (Object.keys(found).length) {
      console.log(tx.merchantName + ' | ' + tx.occurredTime?.slice(0,10) + ': ' + JSON.stringify(found));
    }
  }

  // Also try fetching without transactionType filter to see AUTHORIZATION fields
  const allResult = await fetchPage({ pageSize: '5' });
  console.log('\n=== FULL AUTHORIZATION OBJECT (first non-CLEAR) ===');
  const nonClear = allResult.results.find(tx => tx.transactionType !== 'CLEAR');
  if (nonClear) console.log(JSON.stringify(nonClear, null, 2));
})();
