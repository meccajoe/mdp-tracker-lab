const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: '/Users/archie/projects/mdp-tracker/.env.local' });

const API_TOKEN = process.env.BILLCOM_API_TOKEN;
const BASE_URL = process.env.BILLCOM_BASE_URL || 'https://gateway.prod.bill.com/connect';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function getTag(tx, name) {
  const t = tx.tags.find(t => t.tagType.name === name);
  return t?.selectedTagValues?.[0] ?? null;
}
function parseJobNumber(v) {
  const m1 = v.match(/^(\d{4,5})\s*[-–]/); if (m1) return m1[1];
  const m2 = v.match(/:\s*(\d{4,5})\s*[-–]/); if (m2) return m2[1];
  return null;
}
const CAT_MAP = {
  'Fabrication':'Fabrication','Fab Supplies and Small Equipment':'Fab Supplies and Small Equipment',
  'Graphics':'Graphics','Graphics Supplies':'Fab Supplies and Small Equipment',
  'Design Labor':'Design Labor','Design':'Design','Production Labor':'Production Labor',
  'Install/Strike':'Install/Strike','On-site Show Services':'On-site Show Services',
  'Shipping/Trucking':'Shipping/Trucking','Fuel Costs':'Fuel Costs','Storage':'Storage',
  'Travel-Hotels':'Travel-Hotels','Travel-Per Diem':'Travel-Per Diem',
  'Travel-Airfare & Baggage Fees':'Travel-Airfare & Baggage Fees','Travel':'Travel',
  'Hotels':'Travel-Hotels','Hotel':'Travel-Hotels','Uber, Lyft and Taxi':'Travel',
  'Taxi':'Travel','Rideshare':'Travel','Airfare':'Travel-Airfare & Baggage Fees',
  'Airfare & Baggage Fees':'Travel-Airfare & Baggage Fees','Baggage Fees':'Travel-Airfare & Baggage Fees',
  'Per Diem':'Travel-Per Diem','Meals':'Production Meals','Rental':'Rental',
  'Forklifts and Trucks':'Forklifts and Trucks','Show Prep':'Show Prep',
  'Production Meals':'Production Meals','Machinery Repairs & Maintenance':'Machinery Repairs & Maintenance',
  'Props/Decor':'Props/Decor','I&D Labor':'I&D Labor','Administration':'Fabrication','Other':'Fabrication'
};
function mapCategory(c) {
  if (!c) return 'Fabrication';
  const m = c.match(/:\s*(?:COS\s*-\s*)?(.+)$/);
  const specific = m ? m[1].trim() : c.trim();
  return CAT_MAP[specific.replace(/^\d+\s+/,'')] || CAT_MAP[specific] || 'Fabrication';
}

async function run() {
  console.log('Loading projects and purchasers...');
  const { data: projects } = await supabase.from('projects').select('id,job_number').not('job_number','is',null);
  const projMap = new Map(projects.map(p => [String(p.job_number), p.id]));
  console.log(`  ${projects.length} projects loaded`);

  const { data: purchasers } = await supabase.from('purchasers').select('initials,full_name').eq('active',true);
  const purchMap = new Map(purchasers.map(p => [p.full_name.toLowerCase(), p.initials]));

  console.log('Fetching transactions (loop-safe pagination)...');

  const allTxns = [];
  const seenUuids = new Set();
  let cursor;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({ pageSize: '200' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${BASE_URL}/v3/spend/transactions?${params}`, {
      headers: { apiToken: API_TOKEN, Accept: 'application/json' }
    });

    if (res.status === 429) {
      console.log('\n  Rate limited — waiting 30s...');
      await new Promise(r => setTimeout(r, 30000));
      continue;
    }
    if (!res.ok) {
      const t = await res.text();
      console.error('\nAPI error:', res.status, t.slice(0,300));
      break;
    }

    const page = await res.json();
    const nextCursor = page.nextPage || page.cursor;
    pageCount++;

    // Loop detection: count new UUIDs in this page
    let newCount = 0;
    for (const tx of page.results) {
      if (!seenUuids.has(tx.uuid)) {
        seenUuids.add(tx.uuid);
        allTxns.push(tx);
        newCount++;
      }
    }

    console.log(`Page ${pageCount}: ${page.results.length} returned | ${newCount} new | ${allTxns.length} total unique | cursor: ${nextCursor ? 'yes' : 'NONE'}`);

    // Stop if no new transactions (cursor is looping)
    if (newCount === 0) {
      console.log('  No new transactions — pagination exhausted (cursor was looping). Done.');
      break;
    }

    cursor = nextCursor;
    if (cursor) await new Promise(r => setTimeout(r, 600));
  } while (cursor);

  const completeTxns = allTxns.filter(t => t.status === 'COMPLETE');
  console.log(`\nTotal unique: ${allTxns.length} | COMPLETE: ${completeTxns.length}`);

  // Show breakdown
  const byStatus = {};
  for (const tx of allTxns) byStatus[tx.status] = (byStatus[tx.status]||0)+1;
  console.log('By status:', byStatus);

  let synced=0, skipped=0, maxUpdatedTime='';
  const errors=[];

  for (const tx of allTxns) {
    if (tx.updatedTime > maxUpdatedTime) maxUpdatedTime = tx.updatedTime;
    if (tx.status !== 'COMPLETE') { skipped++; continue; }

    const projectTagValue = getTag(tx, 'Project');
    if (!projectTagValue) { skipped++; continue; }
    const jobNumber = parseJobNumber(projectTagValue);
    if (!jobNumber) { skipped++; continue; }
    const projectId = projMap.get(jobNumber);
    if (!projectId) { skipped++; continue; }

    const billCategory = getTag(tx, 'Category');
    const vendorTag = getTag(tx, 'MDP Vendor') || tx.merchantName;
    const notes = [getTag(tx,'Notes'), billCategory ? 'Bill.com category: '+billCategory : null, 'Cardholder: '+tx.userName].filter(Boolean).join(' | ');

    // Only delete auth holds (amount_pending=true), not other cardholders' cleared transactions
    await supabase.from('expenses').delete()
      .eq('source','billcom').eq('project_id',projectId).eq('vendor',vendorTag).eq('amount',tx.amount)
      .eq('amount_pending', true)
      .neq('external_id',tx.uuid).like('notes','%Cardholder: '+tx.userName+'%');

    const { error } = await supabase.from('expenses').upsert({
      id: randomUUID(), project_id: projectId, date: tx.occurredTime.split('T')[0],
      category: mapCategory(billCategory), vendor: vendorTag, amount: tx.amount, notes,
      source: 'billcom', external_id: tx.uuid, synced_at: new Date().toISOString(),
      amount_pending: false, purchaser: purchMap.get(tx.userName.toLowerCase()) || null
    }, { onConflict: 'external_id' });

    if (error) errors.push(`${tx.uuid}: ${error.message}`);
    else synced++;
  }

  await supabase.from('billcom_sync_state').upsert({
    id: 1, last_sync_at: new Date().toISOString(),
    last_bill_updated_time: maxUpdatedTime || null,
    last_sync_errors: errors.length, last_sync_skipped: skipped,
    last_sync_error_msgs: errors.slice(0,20), updated_at: new Date().toISOString()
  });

  const { count } = await supabase.from('expenses').select('id',{count:'exact',head:true}).eq('source','billcom');
  console.log(`\nDone. synced=${synced} skipped=${skipped} errors=${errors.length}`);
  console.log(`Total Bill.com expenses in DB: ${count}`);
  if (errors.length) console.log('Errors:', errors.slice(0,5));
}

run().catch(console.error);
