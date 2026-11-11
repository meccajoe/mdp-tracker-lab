# Project activity pilot

Fossil Holiday 2026, job 26218, is the first Tracker V2 activity project. Quote revision 22 remains the budget baseline. The project has Budget detail, Quote allocation, Expenses and Labor views; no My Work workflow.

## Sources and boundaries

- Budget and line allocation come from lab_project_quote_sources; no recalculation with Production percentages.
- Activity is a full dated snapshot from Production Tracker, captured with a single read-only SQL statement. No production credentials, polling, outbound integrations or source writes are added to Lab.
- Activity captures live in lab_project_activity_snapshots. Each capture is immutable. The API reads only the newest capture by captured_at; it never sums captures. Repeating the same import is a no-op. A later full capture can reflect source corrections and deletions while retaining historical captures.
- The capture includes expense IDs/source/external IDs and canonical QBO Time ts_ entries with their original source IDs and rate provenance. Manual expense records have their own stable Production IDs.
- This first importer rejects captures containing manual labor or manual actual adjustments until those have a defined reconciliation. It rejects duplicate IDs, noncanonical time and invalid amounts/hours.
- Any future import must use the same complete, single-statement read across expenses, canonical labor, manual labor and manual actuals; never accept a truncated export. The current capture was produced directly with SQL jsonb_agg, without API pagination limits.
- Import requires the reviewed Lab job number and HubSpot deal to match, with a project row lock while inserting. The GET rechecks the current link. No quote baseline, project status or price is updated.
- Members of the baseline quote workspace may read captures under RLS. Anonymous users and nonmembers cannot read them. Only the server role can insert; it cannot update/delete capture history. The API also requires the Lab environment and quote-product allowlist.

## Money and hours

The November 11 approved costing extension supersedes the initial rate-only coverage described below. See [Approved project costing](APPROVED_PROJECT_COSTING.md) for dated authority, day rates, salary exclusions and genuine exceptions.

For the initial capture without a separate approved costing packet, verified base wage cost uses hours times the saved employee rate only when its rate_source is qbo_time_users or qbo_time_users_matched and the rate is positive. Unrated hours remain included in hours; their cost is pending. No assumed rate, payroll burden or missing overtime premium is invented. Summaries aggregate unrounded source values before display rounding.

Budget Detail does not show a complete remaining labor/build cost when any positive hours lack verified rates. It compares shop, design and field hours separately. It shows Production contract/stored allowances as a separate comparison, not a replacement Lab baseline. Activity is project-level; no invented allocation to quote items or item margins.

## Preparing a manual capture

Keep source/customer records outside the repository. The preparation script has no credentials, network calls or database writes:

```sh
node --import tsx scripts/lab/prepare-project-activity.ts \
  --input /tmp/reviewed-activity.json --project 26218 --job 26218 \
  --deal 343941874378 --output /tmp/reviewed-activity-import.sql
```

Review its identity, timestamp, counts, totals and content hash; apply only to Lab with authorized database tooling. Reconcile the saved counts, sums and pinned quote hash afterward. A conflicting timestamp with different content fails rather than silently replacing history.

## Initial saved capture

- Captured November 10, 2026 at 5:51:02 PM America/Chicago (2026-11-10T23:51:02.99863Z).
- 21 expense rows, $18,744.80. 141 time rows, 309.02 hours.
- 53 entries / 100.70 hours without verified rates; verified base wage subtotal $5,548.285, displayed $5,548.29.
- Source content SHA-256 dba007b674e3d49581bc14fd699e8c4bb365de5fe4517649f2c08e4c7b9d9fad (UTF-8 JSON.stringify serialization of the capture).
- Lab quote hash remains 59eb5ce06ea5fe836b402698d376940cf8f2b853785eecacd8ee00901ab1465f, revision 22; project remains Active.

## Verification

308 Lab tests and TypeScript passed. Sanitized Node 24 webpack build passed. Disposable PostgreSQL verified member access, outsider/anonymous denial, denied client writes, append-only server grants, repeated capture and latest-capture deletion semantics. The actual capture imported twice into the disposable database with one saved capture, 21 expenses and 141 time rows.

Browser plugin unavailable. Isolated headless Playwright against the real component with captured fixture data passed at 1440x1000 and 390x844: tab switching, 21/141 row counts, 53 Pending-rate rows, one activity request across Budget/Expenses/Labor, error/retry and not-imported states. Mobile document width stayed 390px; labor table scrolled horizontally. No JS errors. Screenshots remain outside the repository under /tmp/fossil-v2-*.png. The local fixture is not hosted authentication acceptance.

Local vet was attempted after each code unit but could not download its tokenizer due sandbox DNS. No external code-review upload was attempted. Automatic approval review rejected a hosted test that set a real user's JWT claims; that test was not run and no authentication bypass was used. Normal signed-in hosted acceptance remains pending.
