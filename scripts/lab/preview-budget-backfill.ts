// Usage: node --import tsx scripts/lab/preview-budget-backfill.ts <read-only-export.json>
import {readFileSync} from 'node:fs';
import {prepareBaseline} from '../../src/lib/lab-project-sync';

type ExportRow = {
 name: string;
 job_number: string;
 workspace_id: string;
 original_revision: number;
 current_revision: number;
 revision: number;
 pinned_totals: unknown;
 document: unknown;
};

const fields = ['price', 'materialsBudget', 'laborBudget', 'buildBudget', 'hoursAllowed', 'contingency'] as const;
function rounded(value: number) {
 if (!Number.isFinite(value)) throw Error('Missing or invalid numeric budget field');
 return Math.round(value * 100) / 100;
}
function totals(source: unknown) {
 if (!source || typeof source !== 'object') throw Error('Missing budget totals');
 const data = source as Record<string, number>;
 return Object.fromEntries(fields.map(key => [key, rounded(data[key])]));
}

const rows: ExportRow[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(rows) || !rows.length) throw Error('Expected a nonempty project export');
const jobs = new Map<string, ExportRow[]>();
for (const row of rows) {
 if (!/^\d+$/.test(row.job_number) || !row.workspace_id) throw Error('Invalid project identity');
 const list = jobs.get(row.job_number) ?? [];
 list.push(row);
 jobs.set(row.job_number, list);
}

const results = [];
for (const [jobNumber, revisions] of jobs) {
 const {name, workspace_id, original_revision, current_revision, pinned_totals} = revisions[0];
 try {
  if (!Number.isSafeInteger(original_revision) || !Number.isSafeInteger(current_revision) ||
      original_revision < 1 || current_revision < original_revision ||
      revisions.some(row => row.workspace_id !== workspace_id || row.original_revision !== original_revision ||
        row.current_revision !== current_revision) ||
      revisions.length !== (original_revision === current_revision ? 1 : 2)) {
   throw Error('Conflicting revision or workspace identity');
  }
  const calculate = (revision: number) => {
   const row = revisions.find(row => row.revision === revision);
   if (!row) throw Error('Missing saved revision');
   return prepareBaseline(row, {name, hubspot: null});
  };
  const original = calculate(original_revision);
  const current = original_revision === current_revision ? original : calculate(current_revision);
  const pinned = totals(pinned_totals);
  const proposed = totals(current.totals);
  const recalculated = totals(original.totals);
  const originalAgrees = fields.every(key => recalculated[key] === pinned[key]);
  const delta = Object.fromEntries(fields.map(key => [key, rounded(proposed[key] - pinned[key])]));
  const oldItems = new Map(original.budgetHandoff.lines.map(line => [line.id, line]));
  const newItems = new Map(current.budgetHandoff.lines.map(line => [line.id, line]));
  const itemChanges = [];
  for (const id of new Set([...oldItems.keys(), ...newItems.keys()])) {
   const before = oldItems.get(id), after = newItems.get(id);
   const budgetDelta = rounded((after?.buildBudget ?? 0) - (before?.buildBudget ?? 0));
   const hoursDelta = rounded((after?.hoursAllowed ?? 0) - (before?.hoursAllowed ?? 0));
   const priceDelta = rounded((after?.finalPrice ?? 0) - (before?.finalPrice ?? 0));
   const kind = !before ? 'added' : !after ? 'removed' : 'updated';
   if (kind !== 'updated' || before?.name !== after?.name || budgetDelta || hoursDelta || priceDelta) {
    itemChanges.push({id, name: after?.name ?? before?.name, kind, budgetDelta, hoursDelta, priceDelta});
   }
  }
  results.push({jobNumber, name, original_revision, current_revision, originalAgrees, pinned, proposed, delta,
   itemChanges, workforceCandidates: current.budgetHandoff.workforceCandidates});
  if (!originalAgrees) process.exitCode = 1;
 } catch (error) {
  results.push({jobNumber, name, error: error instanceof Error ? error.message : String(error)});
  process.exitCode = 1;
 }
}
console.log(JSON.stringify(results, null, 2));
