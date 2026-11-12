# Daily Tracker V2 project sync

Agreed November 12, 2026: include existing linked projects and newly Closed Won Active Lab quotes; run daily at 6:00 a.m. America/Chicago. This is a design and implementation scope, not an enabled schedule. No recurring sync or source connection was created by the costing release.

## Source ownership

| Information | Authority | Sync behavior |
| --- | --- | --- |
| Project name and job number | Linked HubSpot deal | Mirror exact values after identity/conflict checks |
| PM, close date and other approved CRM reference fields | Linked HubSpot deal / verified property mappings | Extend current identity-only refresh with explicit mappings; do not guess field names or overwrite populated values from failed reads |
| Budget, quoted hours and item allocation | Approved Lab quote baseline | Pin the selected workspace/revision when creating a project; later working revisions do not silently change an existing budget |
| Active/completed state | Linked Lab quote state | Preserve existing quote-driven status behavior; do not import conflicting Production status |
| Expenses, canonical time and approved direct labor costing | Production Tracker during transition | Read only, validate, and save one matching full activity/costing capture per project/run |

Open quotes remain outside project creation. Already completed quotes do not trigger a historical bulk import. Existing linked projects retain history when completed. Quotes and Capacity workflows, scenarios, estimates and pricing remain owned by Paul.

## Project selection and identity

Refresh existing reviewed links. Discover newly Closed Won Active quote groups and create one project from the selected version. Use stable HubSpot deal ID plus job number, workspace/group identity and uniqueness constraints; never match on project name alone. A missing job/deal, duplicate association, ambiguous quote group or conflicting existing link goes to an exception list. Similar or reversed worker names do not establish identity.

Project creation must be repeatable without duplicates. Baseline capture, project linkage and initial quote-driven status belong in one transaction. Confirm the existing selected-version/head rules rather than choosing the largest revision number across workspaces.

## Daily activity import

1. Obtain the allowlisted Lab project scope and newly eligible quote links.
2. Read approved HubSpot fields through the narrow read-only connection. The current manual refresh reads only name/job; PM and other fields need implementation and mapping validation.
3. Obtain full expenses, canonical time and corresponding approved costing evidence using a dedicated least-privilege read-only source export. Do not place Production service-role credentials in Lab or enable inherited accounting/TSheets/BILL integration routes.
4. Validate source identity, completeness, unique IDs, dated approvals and reconciliation totals. Publish activity and its matching costing packet together, avoiding a window where a new activity capture appears without its cost evidence.
5. Record run/project outcomes, source timestamps, capture IDs, counts, totals and exceptions. Retain immutable history and use explicit run/project idempotency keys for retries.

A source/read/validation failure retains the last good capture and marks that project's refresh failed/stale; it must not masquerade as zero activity or delete history. Other independent projects can continue, with the whole run marked partial. Genuine missing pay rates remain explicit exceptions rather than guessed amounts. Handle source corrections/deletions via a validated full later capture.

## Scheduling and acceptance

Implement an authenticated application job with overlap protection, bounded work/retries and a persistent run log. Preserve America/Chicago 6:00 a.m. through daylight saving changes. Existing Lab vercel.json has no crons and inherited integration routes are blocked; simply turning those routes on is outside this design.

Before enabling recurrence: implement and review the scoped source connection and atomic importer, run manually with a preview/diff, validate new-project creation and retry idempotency, confirm source identities and quote baselines, test partial failure/changed links, and verify last successful sync visibility. Never create a ChatGPT reminder and describe it as a functioning data pipeline.
