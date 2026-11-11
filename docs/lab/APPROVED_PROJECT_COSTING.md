# Approved project costing

V2 uses Production Tracker’s approved direct labor reconciliation for saved activity. Quote revision budgets remain the baseline. No Production code or data is changed and no live payroll connection is added.

## Authority and capture

The read-only export adapter retains the actual `public.project_labor_reconciliation_summary` costing CTEs and aggregation, scoped to one reviewed source project and the exact canonical time IDs in the saved Lab activity snapshot. It supports approved dated hourly policies, payroll rate authority from approved/nonrevoked imports, verified QBO Time hourly rates, approved day rates charged once per worker/project/date, and explicit salary exclusions. It does not interpret an annual salary as an hourly rate. Payroll burden and unrecorded overtime premiums are excluded, matching the source view.

Cost evidence is saved separately in append-only `lab_project_costing_snapshots`, bound to the activity UUID and content hash, job, deal and source project. It includes approval identity/time, effective dates and payroll import provenance where applicable. Original activity captures are unchanged. The API and directory read the newest evidence for that exact capture; there is no automatic rate refresh. A new activity capture needs its own reviewed costing packet.

Runtime validation requires complete unique row coverage, unchanged person/date/hours, approved sources, date coverage, provenance, valid hourly arithmetic, once-per-day charging, explicit exclusions, and agreement with the source aggregate. Decimal costs are added exactly and rounded once at the aggregate boundary. Invalid evidence blocks display; query failures never silently revert to an incomplete lower total. Without a cost packet, the prior saved verified QBO rate behavior remains. Raw activity cannot inject approved costs.

Members read evidence through the existing activity/workspace RLS chain and quote-product guard. Anonymous and nonmember access is denied. Authenticated clients cannot insert, update or delete; server grants are SELECT/INSERT only. Actual payroll rates and exports stay outside Git.

## Manual preparation

1. Read the current approved production view definition and review its rules. Generate a bounded read-only query with `approvedCostingQuery` in `scripts/lab/approved-costing-query.ts`. Execute only against the authorized source project and exact saved activity IDs; export JSON privately.
2. Prepare and validate offline:

```sh
node --import tsx scripts/lab/prepare-project-costing.ts \
  --activity /tmp/reviewed-activity.json \
  --evidence /tmp/reviewed-approved-costing.json \
  --view-definition /tmp/reviewed-costing-view.sql \
  --snapshot REVIEWED_ACTIVITY_UUID --snapshot-hash REVIEWED_ACTIVITY_HASH \
  --output /tmp/reviewed-costing-packet.json \
  --sql /tmp/reviewed-costing-import.sql
```

3. Review the resulting totals and genuine exceptions. Apply the guarded SQL only to Lab. It locks and rechecks the activity/project identity and rejects conflicting timestamp content. Repeating identical evidence does not duplicate it. Reconcile stored counts/totals and unchanged quote/activity hashes afterward.
4. Payroll exceptions require verified worker identity, approved rate or cost basis, approver and effective dates covering the work. Corrections belong in the approved source authority; re-export a new dated costing packet afterward. Never guess a rate or merge similar/reversed names without identity evidence.

## Fossil pilot, November 11, 2026

Applied migration `20261111224224_lab_project_costing_snapshots` only to Lab and saved one reviewed costing packet for activity `b5a30a5c-8d63-406b-b620-ccab6889d469`. Repeated import produced one packet. Same 141 records / 309.02 hours and 21 expenses / $18,744.80 as November 10 capture. Approved direct labor subtotal $8,268.40; known build cost $27,013.20 plus pending labor. Coverage improved from 100.70 missing hours to 24.75 missing hours across ten records:

| Person | Worker ID | Unresolved hours | Records | Work dates |
| --- | --- | ---: | ---: | --- |
| Alan Escudero (1) | 13640560 | 17.37 | 6 | November 4–9, 2026 |
| Benitez Robertino | 14242832 | 7.38 | 4 | November 9, 2026 |

Neither has approved cost evidence covering these saved work dates. Complete remaining labor/build budget stays pending. A private payroll exception CSV was prepared locally; no message was sent. Other projects’ activity has not been bulk imported. Project remains Active; pinned quote revision 22, original quote hash and activity hash are unchanged.

## Verification

321 Lab tests and TypeScript, sanitized Node 24 webpack build, and three disposable PostgreSQL suites passed. Coverage includes dated approvals, identity/hash/time mismatch, source provenance, aggregate rounding, daily/excluded/missing treatment, unsupported evidence, API failures, consistent directory totals and membership isolation. Hosted independent reconciliation confirmed original hashes, counts and one costing packet. Supabase advisors reported existing unrelated findings and none on the new costing table. Local vet could not download its tokenizer because DNS was unavailable; no external private-code upload.

Isolated real-component browser verification passed at desktop and mobile sizes: $27,013.20 known build cost, $8,268.40 approved direct labor, 24.75 unresolved hours, two exception rows and ten Pending cost records. One activity read across tabs; no JS errors. Quotes and Capacity retained identical protected-page rendering. Normal signed-in hosted acceptance remains pending.
