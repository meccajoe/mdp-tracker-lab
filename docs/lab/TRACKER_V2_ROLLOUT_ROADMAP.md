# Tracker V2 rollout roadmap

Owner: Joe. Quote and Capacity owner: Paul. Plan updated November 17, 2026.

Target a controlled company rollout by **December 18**, before Christmas. December 31 is the outside target, not a reason to skip readiness checks. Joe’s approximately 40% assessment is a planning estimate; readiness will be measured by the gates below rather than an invented completion percentage.

## 1. Reliable project mirror — November 17–20

- Import the three newly linked Active projects and four Complete projects. Completed history must stay completed; all job numbers must open the correct project.
- Extend the existing 6 a.m. America/Chicago sync to existing linked projects plus newly won Active/Complete quotes. Read current HubSpot identity and dates, retain authoritative Lab quote status, capture current Production expenses/time and approved costing, preserve pinned Lab budgets/history.
- Fill a missing job number from a saved deal link, or find an association only when an explicit job or unique exact canonical project name identifies one source project. Verify against HubSpot and the source activity export. Ambiguous/missing links must remain actionable exceptions; similar names are not enough.
- Keep latest sync time/needs-attention visible. A failed project retains its last good data; no silent success when projects are skipped. Owner memberships automatically include Joe on future Paul-created workspaces.
- Reconcile every imported project: identity, status, quoted allowance, recorded hours, confirmed labor costs, expenses, and pending items. Existing payroll confirmations apply only to their approved identities/dates; newly uncovered workers need confirmation.

**Gate:** every current Closed Won Active/Complete group either has one correct project or a named exception with an owner. All project links work. Two successive 6 a.m. runs refresh without identity/import failures, duplicates or baseline changes. Financial gaps remain explicit and separate from transport success.

## 2. Settle financial authority and change control — November 23–December 4

- Agree a field-by-field authority map: HubSpot = deal identity/job number/PM/commercial dates; Lab quote = approved scope and pinned budget; actual expenses/time/pay = operational sources with dated evidence; Lab quote status = V2 project lifecycle.
- Resolve the open Tyson commercial-versus-Lab quote difference with Paul. Fossil’s evolving scope requires an explicit revised baseline decision, not an automatic replacement of the original budget.
- Define revision/change-order approval: retain the original baseline, show approved revisions separately, and log who approved any budget adoption. Daily synchronization must never silently reprice an existing project.
- Clear newly found payroll exceptions, retain known designer-policy confirmations, and verify rates against current payroll information where necessary. Decide how overtime premiums, day rates, exclusions and burden should appear without conflating estimates and actual costs.
- Confirm allocation rules: project-level actuals remain project-level unless supported item/category assignments exist. A source work label alone is not proof of field location or project stage.

**Gate:** Paul and Joe accept reconciled financial views for representative fabrication, installation and completed jobs, including at least one scope revision, credit and rate exception. Each remaining dollar difference is explained and approved, not hidden.

## 3. Replace the Production dependencies — December 7–11

The current V2 mirror still reads its actuals from Production Tracker. **V1 cannot be retired while V2 depends on it for those feeds.**

- Inventory Workflow A/B, QuickBooks project creation, Workforce build items, HubSpot events, BILL expenses, QBO Time labor, payroll evidence, documents and operational links. Identify the exact live triggers, deduplication keys, credentials, owners and recovery paths.
- Build and validate the V2 quote-to-project handoff and downstream work in isolated/test destinations first. Use approved quote revisions and stable deal/job/group IDs. Replays must not create a second project, invoice, build item or expense.
- Establish direct V2 actuals ingestion or another agreed independent source path. Decide the one writer for each integration during transition. The Lab’s read-only exception does not authorize turning on outbound accounting, CRM or Workforce writes.
- Add integration health, retry/reconciliation procedures and an operator runbook. Surface stale/missing feeds where users make project decisions.
- Test staff accounts and ownership/PM visibility; Joe’s all-workspace owner access must not accidentally broaden everyone else’s access. Confirm the production navigation and minimum PM workflow needed for rollout without disrupting Paul’s Quotes/Capacity.

**Gate:** a won quote can pass through project creation, approved budget handoff, downstream job/build setup and returning actuals in test, with safe retry and no duplicate actions. V2 refresh continues with V1 ingestion unavailable. Joe approves the exact live connector destinations before live activation.

## 4. Parallel operation, rehearsal and cutover — December 14–18

- Have Paul, at least one PM and accounting/operations run representative projects end to end. Track defects by must-fix versus follow-up; cosmetic refinements must not displace missing financial/integration controls.
- Compare V1/V2 identities, statuses, project counts, hours, expenses, approved costs and documents over several workdays. Explain all material differences using the authority map.
- Rehearse database backup/restore, failed-sync recovery, webhook replay and rollback. Record what happens to changes made after cutover so a rollback does not lose work or double-post accounting events.
- Freeze the old integration writers only at the approved cutover; enable V2 writers deliberately. Keep V1 available read-only until retention/recovery obligations are settled.
- Publish a short user guide, named support owner and known-limitations list. Joe and Paul make a documented go/no-go decision using the gates above.

**Gate:** no unowned critical defects, unexplained financial differences or V1-only ingestion dependencies; tested recovery; business users accept the workflow. If a gate fails, defer cutover and keep V1 functioning.

## Immediate follow-up after sync verification

1. Review the seven imported projects and any new financial exceptions.
2. Have Paul decide the outstanding reference-project budget differences.
3. Complete the Workflow A/B and integration dependency inventory before committing to an irreversible cutover date.

This document plans the migration; it does not activate live outbound integrations or authorize a business-production cutover.
