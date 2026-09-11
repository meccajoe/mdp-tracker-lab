# Mecca Quote-to-Production v1 Build Specification

> **For Hermes:** Use `subagent-driven-development` to implement this specification task-by-task. Every production behavior follows RED → GREEN → REFACTOR. Do not make live QBT/QBO changes until the pilot gate explicitly authorizes them.

**Status:** Ready for implementation review  
**Date:** 2026-09-03  
**Owners:** Paul — commercial approval; Rooster/Caleb McCallum — operational readiness, release, and production execution  
**Product owner:** Joe Mecca  
**System of record:** MDP Tracker

**Architecture:** Extend the existing pre-project `ada_quote_workspaces` aggregate in place, normalize immutable revision data into relational child tables, and materialize released work packages into Tracker projects through audited application services. External writes use a durable outbox, stable idempotency keys, exact external IDs, and read-back verification; compatibility adapters keep the current Ada and Closed Won paths available until governed replacements pass pilot gates.

**Tech stack:** Next.js 16 App Router, TypeScript, Supabase/PostgreSQL with RLS and database functions, Node test runner/tsx contracts, HubSpot CRM/Quotes APIs, QuickBooks Workforce/QBO Time, BILL Spend & Expense, Google Sheets/XLSX, PM2 on the Mac Mini.

## 1. Goal

Build a governed, traceable operating path from quote creation through production closeout:

```text
Quote Workspace
  → reviewed quote revision
  → HubSpot customer quote
  → customer acceptance
  → operational readiness and release
  → Tracker project and Build Items
  → QuickBooks Workforce/QBO Time actual labor
  → BILL spending workflow
  → Tracker reporting and post-mortem
  → individually reviewed Ada lessons
```

The first usable release must establish the canonical records and approval gates. It must not attempt to replace every spreadsheet, build a custom time clock, or infer missing production truth.

---

## 2. Approved business decisions

1. Tracker is the central operating record for the project lifecycle.
2. Build Items bridge estimating, production, and labor tracking.
3. **“item should be any labor-bearing work package.”**
4. Commercial quote lines and Build Items have a many-to-many relationship.
5. Build Items may have quantity and parent/child structure, while the normal worker view remains flat.
6. Paul owns commercial approval and may approve operational release.
7. Rooster owns operational readiness, operational release, and production execution.
8. QuickBooks Workforce is piloted before changing the live worker process.
9. Workers use the shortest viable flow:

   ```text
   Job → Build Item → Type of Work → Clock In
   ```

10. Workers do not classify change causes, rework, or commercial treatment while clocking.
11. Quote-originated values, authorized changes, forecasts, actual labor, and actual cost remain distinct.
12. Quote Allocation is the production source of truth; Budget Detail is a secondary roll-up.
13. Only individually reviewed, approved, source-linked lessons may enter Ada’s reusable intelligence.
14. Existing production practices are presumed compatible, but the Workforce pilot must still verify that the new workflow does not disrupt them.

---

## 3. Operator truth

### 3.1 Current operating reality

- Estimating begins before a Tracker project, job number, HubSpot deal, QBT jobcode, or BILL budget necessarily exists.
- The v8 workbook currently carries the strongest complete quote formula and handoff model.
- HubSpot owns the customer/deal/quote lifecycle.
- QuickBooks Workforce/QBO Time is the existing worker time-entry and accounting-facing time system.
- BILL owns project spending/request controls for the categories already managed there.
- Tracker already owns project budgets, actual labor and expenses, reconciliation, completion review, and post-mortems.
- Ada already supports durable quote conversations, evidence, generated revisions, revision deltas, and private Sheets, but its database naming and owner-only access reflect the prototype rather than the final operating model.

### 3.2 What must improve

- A quote must remain durable before and after its external systems are linked.
- Approved commercial and production facts must be normalized, queryable, and immutable—not recoverable only from JSON or spreadsheet formulas.
- Build Item identity must survive label edits, quote revisions, production handoff, and QBT label changes.
- Approval, publication, customer acceptance, readiness, release approval, and actual release must be separate auditable events.
- Worker selections must be descriptive and project-scoped without redundant fields.
- Variance reporting must compare like with like and expose incomplete coding instead of hiding it.

---

## 4. Scope

### 4.1 In v1

- Tracker-owned Quote Workspace lifecycle.
- Multi-user workspace access with explicit roles.
- Immutable, normalized quote revisions.
- Commercial lines, Build Items, quantities, hierarchy, and many-to-many mappings.
- Item × Type-of-Work quoted labor allocations.
- Structured Ada proposals with visible diffs and explicit human disposition.
- Commercial approval.
- HubSpot quote publication with durable outbox, idempotency, and read-back verification.
- Customer acceptance bound to one published revision.
- Production readiness, operational-release approval, and actual release as separate events.
- Project and work-package materialization from the approved revision.
- QBT/Workforce pilot mappings and raw field capture.
- Append-only labor-correction overlays.
- Baseline, approved changes, actuals, forecast, and variance reporting.
- BILL provisioning gated by operational release for the new workflow.
- Immutable post-mortem source snapshots and reviewed lessons.

### 4.2 Explicitly deferred

- Custom Tracker time clock.
- Build Item-level material, subcontractor, rental, freight, and invoice actuals.
- Broad historical reconstruction/backfill.
- Automated lesson approval or autonomous model training.
- Worker scoring or incentive compensation.
- Advanced production scheduling/capacity planning.
- Immediate replacement of all spreadsheet workflows.
- Live QBT `Service Item` rename or choice changes before pilot proof.
- Automated inference of trade allocations from free-text Takeoffs descriptions.

---

## 5. System boundaries

| System | Owns | Must not own |
|---|---|---|
| Tracker | Quote Workspace, revisions, Build Items, approvals, release state, mappings, operational budgets, reconciliation, reports, evidence, post-mortems, lessons | Customer-facing HubSpot status, payroll accounting truth |
| Ada | Analysis, evidence retrieval, draft language, structured proposals, assumptions, uncertainty | Approval, publication, acceptance, release, downstream record creation |
| HubSpot | Deal, customer-facing quote, customer acceptance/commercial lifecycle | Internal work-package allocations, wage cost, production notes |
| Workforce/QBT | Worker time capture and raw time-entry/custom-field facts | Canonical Build Item identity, authorization/cause classification, final variance interpretation |
| QBO | Accounting/payroll-facing time and product/service records | Tracker’s production baseline or quote revision lineage |
| BILL | Approved spending/request workflow | Full project budget or labor authorization |
| Google Sheet/XLSX | Working artifact and formula continuity | Last-write-wins canonical state after approval |

### 5.1 Source precedence

1. Current explicit human instruction and approved revision.
2. Current source evidence and reviewed structured inputs.
3. Versioned formula/rate policy.
4. Authorized Tracker history/comparables.
5. Ada expert estimate, clearly labeled.

A lower-precedence source cannot silently overwrite a higher-precedence source.

---

## 6. Canonical lifecycle

```text
intake
→ draft
→ internal_review
→ commercial_approved
→ published_verified
→ customer_accepted
→ production_readiness_confirmed
→ operational_release_approved
→ release_approved_pending_provisioning
→ operationally_released
→ active_project
→ completed
→ postmortem_review
→ closed
```

`archived`, `cancelled`, `expired`, `blocked`, and `superseded` are explicit side states; they are not substitutes for deleting history.

### 6.1 Gate rules

- A revision may enter `commercial_approved` only when validation passes and an authorized human approves it.
- HubSpot publication may use only the exact approved revision.
- `published_verified` requires successful HubSpot read-back and a matching manifest hash/totals.
- Customer acceptance must reference the exact published quote and revision.
- Production readiness requires the release checklist and no blocking exceptions.
- Operational-release approval is distinct from readiness.
- Paul is the sole normal v1 operational-release approver. Rooster cannot approve his own release in v1; any admin break-glass approval requires a reason and audit event.
- Approval moves the workspace to `release_approved_pending_provisioning`. Tracker then atomically creates/links the pending project, materializes Build Items and baseline authorizations, and enqueues destination-specific QBT/BILL commands.
- QBT mapping/read-back is required before actual release. BILL read-back is also required unless Paul records an explicit, reasoned BILL exception. Failed or partial provisioning leaves the workflow pending/blocked and does not create an `operationally_released` event.
- Rooster performs the actual operational release only after the required provisioning gate passes; that event also promotes the Tracker project from Pending to Active.
- A later change creates an amendment/revision and additive authorization records; it does not rewrite the original baseline.
- Commercial approval may be revoked only before publication. After publication, correction requires a superseding revision and, when applicable, a HubSpot void/supersede action.
- Operational-release approval may be revoked before execution. An actual `operationally_released` event is a historical fact and cannot be revoked or deleted; a later stop, hold, cancellation, or rollback is a new event/state.

### 6.2 Required event types

- `workspace_created`
- `evidence_attached`
- `proposal_created`
- `proposal_accepted`
- `proposal_rejected`
- `proposal_edited`
- `revision_created`
- `revision_submitted_for_review`
- `commercial_approved`
- `commercial_approval_revoked`
- `publication_requested`
- `publication_succeeded`
- `publication_failed`
- `publication_drift_detected`
- `customer_accepted`
- `customer_acceptance_revoked_or_voided`
- `production_readiness_confirmed`
- `operational_release_approved`
- `operationally_released`
- `release_blocked`
- `change_requested`
- `change_approved`
- `work_package_corrected`
- `labor_coding_corrected`
- `project_completed`
- `postmortem_approved`
- `lesson_approved`
- `lesson_withdrawn`

Each event records `event_id`, aggregate IDs, actor, actor role/capability, timestamp, prior state, resulting state, reason, evidence references, and structured payload.

---

## 7. Canonical data model

Existing `ada_*` tables remain in place initially to avoid a dangerous rename migration. In product language and APIs, `ada_quote_workspaces` becomes the Tracker Quote Workspace aggregate; Ada is one participant. A later cosmetic table rename is not part of v1.

### 7.1 Quote Workspace and access

#### Extend `ada_quote_workspaces`

Add:

- `workspace_number text` — durable human reference.
- `lifecycle_status text` — canonical lifecycle projection.
- `current_revision_id uuid nullable`.
- `commercial_approved_revision_id uuid nullable`.
- `hubspot_published_revision_id uuid nullable`.
- `customer_accepted_revision_id uuid nullable`.
- `operationally_released_revision_id uuid nullable`.
- `archived_at timestamptz nullable`.
- `row_version bigint not null default 1` — optimistic concurrency.

Keep `hubspot_deal_id` and `tracker_project_id` nullable until explicit linking.

#### `quote_workspace_members`

- `workspace_id uuid`.
- `user_id uuid nullable`.
- `email_normalized text`.
- `workspace_role text`: `owner | editor | reviewer | viewer`.
- `added_by`, `added_at`, `removed_at`.
- Unique active membership per workspace/user identity.

Authorization uses membership plus capability checks. Client-side hiding is never sufficient.

### 7.2 Immutable revisions

#### Extend `ada_quote_revisions`

Add:

- `revision_kind text`: `baseline | revision | amendment | change_order`.
- `parent_revision_id uuid nullable`.
- `source_manifest_hash text`.
- `normalization_status text`: `pending | normalized | needs_review | mismatch`.
- `normalized_at timestamptz nullable`.
- `formula_policy_version text`.
- `currency text not null default 'USD'`.
- `created_from text`: `human | ada_proposal | workbook_import | sheet_sync | hubspot_import`.
- `supersedes_revision_id uuid nullable`.
- `locked_at timestamptz`.

`quote_json` remains a compatibility/render snapshot. It is not the only canonical representation after normalized tables land.

Database rules:

- Unique `(workspace_id, revision_number)`.
- Revision rows and normalized child rows are insert-only after `locked_at`.
- No cascade-delete path may remove an approved, published, accepted, released, or post-mortem-referenced revision.
- Existing hard-delete UI/API behavior becomes archive for governed records.

Database enforcement—not route convention—provides immutability:

- A trigger rejects UPDATE/DELETE of locked revision content and normalized children. Only explicitly listed projection/pointer fields may change.
- Publication payload identity, acceptance observations, finalized readiness versions, release events, import versions, correction events, and post-mortem source snapshots are append-only.
- Mutable status columns are convenience projections rebuilt from immutable events; service functions are the only writers.
- The membership migration replaces existing workspace/revision/sheet/sheet-change foreign-key cascades with named `RESTRICT` constraints for governed history. Draft cleanup, if retained, is an explicit service function that first proves no approval/publication/release/post-mortem reference exists.
- Drop `auth_all_qbo_labor_entries` from `20260401000000_qbo_labor_entries.sql` lineage and replace it with named admin/finance read policies plus service-role sync. Do not retain authenticated-wide read/write access to wage evidence.

### 7.3 Commercial lines

#### `quote_revision_lines`

- `id uuid` — revision-scoped immutable line ID.
- `logical_line_id uuid` — stable identity across revisions.
- `revision_id uuid`.
- `workspace_id uuid`.
- `sort_order integer`.
- `sku text nullable`.
- `name text`.
- `description text nullable`.
- `line_type text`.
- `quantity numeric(12,4)`.
- `unit text nullable`.
- `unit_sell_price numeric(14,2) nullable`.
- `computed_sell_price numeric(14,2)`.
- `sell_price_override numeric(14,2) nullable`.
- `final_sell_price numeric(14,2)`.
- `taxability_status text nullable`.
- `formula_type text nullable`.
- `formula_inputs jsonb`.
- `formula_status text`: `complete | needs_input | exception`.
- `materials_other_budget numeric(14,2)`.
- `quoted_hours numeric(12,4)`.
- `labor_budget numeric(14,2)`.
- `build_budget numeric(14,2)`.
- `contingency_amount numeric(14,2)`.
- `indirect_levy_amount numeric(14,2)`.
- `margin_amount numeric(14,2)`.
- `margin_pct numeric(9,6)`.
- `source_ref jsonb` — workbook cells, HubSpot line ID, import row, or direct input.
- `evidence_refs jsonb`.

Financial values must never be inferred from labels alone. SKU routes formula type; missing required inputs produce `needs_input`.

### 7.4 Stable Build Items/work packages

#### `work_packages`

This is the stable identity spanning quote and production.

- `id uuid primary key`.
- `workspace_id uuid not null`.
- `project_id text nullable`.
- `item_number integer not null` — scoped to workspace before handoff and project after handoff.
- `parent_work_package_id uuid nullable`.
- `quantity numeric(12,4) not null default 1`.
- `unit text nullable`.
- `classification text`: `fabrication | graphics | resale | service | project_wide | pass_through`.
- `status text`: `draft | approved | released | active | completed | cancelled | superseded`.
- `created_at`, `created_by`, `archived_at`.

Constraints:

- Unique active `(workspace_id, item_number)`.
- Unique active `(project_id, item_number)` when `project_id` is not null.
- Parent must belong to the same workspace/project.
- A description edit never changes `id`.
- `Item 01` without workspace/project context is invalid.
- `item_number` is assigned once and never silently renumbered. Handoff keeps the workspace number; a collision in an already-linked project is a blocking exception that a human resolves through an audited correction before approval.
- Release preparation acquires a transaction-scoped advisory lock on the workspace and target project, then checks both unique indexes before linking. Concurrent handoffs cannot produce duplicate numbers or two active releases.
- Parent/child relationships remain UUID-based; handoff validates that every parent is in the same released manifest and target project.

#### `quote_revision_work_packages`

Immutable snapshot of a work package in one revision:

- `id uuid`.
- `revision_id uuid`.
- `work_package_id uuid`.
- `display_name text`.
- `description text nullable`.
- `line_type text`.
- `quantity numeric(12,4)`.
- `unit text nullable`.
- `resale_classification text`.
- `materials_other_budget numeric(14,2)`.
- `total_quoted_hours numeric(12,4)`.
- `labor_budget numeric(14,2)`.
- `production_notes text nullable`.
- `sort_order integer`.
- `source_ref jsonb`.
- Unique `(revision_id, work_package_id)`.

### 7.5 Commercial line ↔ Build Item mapping

#### `quote_revision_line_work_packages`

- `id uuid primary key`.
- `workspace_id uuid`.
- `revision_id uuid`.
- `commercial_line_id uuid`.
- `revision_work_package_id uuid`.
- `mapping_status text`: `mapped | commercial_only | needs_review`.
- `allocation_basis text`: `quantity | percentage | explicit_amount | direct`.
- `allocated_quantity numeric(12,4) nullable`.
- `allocated_sell_amount numeric(14,2) nullable`.
- `allocated_hours numeric(12,4) nullable`.
- `allocation_pct numeric(9,6) nullable`.
- `notes text nullable`.

Constraints:

- Foreign keys bind the workspace, revision, commercial line, and revision work package to the same revision aggregate.
- Unique `(revision_id, commercial_line_id, revision_work_package_id)`.
- Allocated numeric values are nonnegative; `allocation_pct` is between 0 and 1.
- Exactly one allocation basis is authoritative per row; fields not used by that basis remain null.
- `commercial_only` is stored on the commercial line’s `production_mapping_status` and permits zero mapping rows only with a required reason.
- A deferrable revision-validation function proves mapped quantity/amount/percentage totals reconcile to the commercial line within $0.01, 0.01 hours, and 0.0001 quantity/percentage tolerances as applicable.

No implicit equal split. Any mismatch leaves the revision `needs_review` and blocks commercial approval.

### 7.6 Type of Work and quoted labor

#### `work_types`

- `id uuid`.
- `code text unique`.
- `display_name text`.
- `category text`: `shop | design | install | dismantle | logistics | other`.
- `active boolean`.
- `sort_order integer`.
- `qbo_service_item_name text nullable`.
- `qbo_service_item_id text nullable`.

Initial candidate taxonomy is subject to pilot confirmation:

- Carpentry / Assembly
- CNC
- Paint / Finish
- Metal / Welding
- Graphics
- Electrical
- Sculpt / Specialty
- Pull / Pack / Prep
- Test Fit
- Design
- Install
- Dismantle

`Install/Dismantle` is legacy-only and cannot be split historically without evidence.

#### `quote_revision_work_package_labor`

- `id uuid`.
- `revision_id uuid`.
- `revision_work_package_id uuid`.
- `work_type_id uuid nullable`.
- `quoted_hours numeric(12,4)`.
- `quoted_labor_value numeric(14,2) nullable`.
- `allocation_origin text`: `structured_input | workbook | import | reviewed_inference | unallocated`.
- `allocation_status text`: `allocated | unallocated | needs_review`.
- `source_ref jsonb`.
- `notes text nullable`.

Total child hours must equal the work-package total within an explicit tolerance, or the revision remains blocked. Existing aggregate-only hours are stored as `unallocated`; trade splits are never invented.

### 7.7 Operational labor authorization and forecast

#### `work_package_labor_authorizations`

Append-only rows:

- `id uuid`.
- `project_id text`.
- `work_package_id uuid`.
- `work_type_id uuid nullable`.
- `authorization_type text`: `original_baseline | approved_customer_change | pending_disputed_change | internal_nonbillable`.
- `cause text`: `customer_scope_change | design_engineering_change | estimating_scope_miss | production_rework_quality | vendor_material_failure | site_condition | schedule_coordination_disruption | warranty_callback | pending_review`.
- `hours_delta numeric(12,4)`.
- `commercial_amount_delta numeric(14,2) nullable`.
- `source_revision_id uuid nullable`.
- `change_order_ref text nullable`.
- `status text`: `pending | approved | rejected | superseded`.
- `requested_by`, `reviewed_by`, `requested_at`, `reviewed_at`.
- `evidence_refs jsonb`, `notes text`.

Constraints and summary rules:

- Original baseline hours are nonnegative, `approved`, unique per released revision × work package × work type, and have no operational cause.
- Customer-change and pending/disputed rows use a nonzero signed delta so approved scope reductions are representable.
- Internal/non-billable rows use positive hours and require an operational cause.
- Non-baseline rows require a cause; `pending_review` is allowed only while status is pending.
- Only `approved` original-baseline and approved-customer-change rows contribute to current authorized hours.
- Rejected and superseded rows remain visible but contribute zero.
- A database validation function blocks approved changes that would reduce current authorized hours below zero.

Original baseline rows are written once from the approved provisioning manifest. Later changes append rows.

#### `work_package_forecasts`

- `id uuid`.
- `project_id text`.
- `work_package_id uuid`.
- `work_type_id uuid nullable`.
- `forecast_total_hours numeric(12,4)`.
- `forecast_remaining_hours numeric(12,4)`.
- `as_of_at timestamptz`.
- `forecast_by text`.
- `reason text nullable`.

Forecast is never stored as an overwrite of allowed hours.

### 7.8 Integration outbox and external evidence

#### `integration_outbox`

- `id uuid`.
- `aggregate_type text`.
- `aggregate_id text`.
- `destination text`: `hubspot | qbt | bill | google_sheets`.
- `operation text`.
- `idempotency_key text unique`.
- `external_identity text nullable`.
- `payload_json jsonb`.
- `payload_hash text`.
- `status text`: `pending | processing | succeeded | retryable_failed | terminal_failed | cancelled`.
- `attempt_count integer`.
- `max_attempts integer`.
- `lease_owner text nullable`.
- `lease_expires_at timestamptz nullable`.
- `next_attempt_at timestamptz nullable`.
- `last_error_code text nullable`.
- `last_error_message text nullable`.
- `created_at`, `updated_at`, `completed_at`.

#### `quote_publications`

- `id uuid`.
- `workspace_id uuid`.
- `revision_id uuid`.
- `hubspot_deal_id text`.
- `hubspot_quote_id text nullable`.
- `publication_number integer`.
- `status text`: `requested | published | verified | failed | drifted | superseded | voided`.
- `payload_hash text`.
- `readback_hash text nullable`.
- `expected_total numeric(14,2)`.
- `readback_total numeric(14,2) nullable`.
- `published_by`, `published_at`, `verified_at`.
- `external_status text nullable`.
- `error_json jsonb`.

The row's request identity, revision, deal, publication number, payload hash, and expected total are immutable. `status` and read-back columns are rebuildable projections from `quote_publication_events`; they are never the sole evidence.

#### `quote_publication_events`

- `id uuid primary key`.
- `publication_id uuid`.
- `event_type text`: `requested | external_created | associated | readback_observed | verified | failed | drifted | superseded | voided`.
- `external_event_id text nullable`.
- `payload_hash text nullable`.
- `readback_hash text nullable`.
- `evidence_json jsonb`.
- `observed_at timestamptz`.
- `observed_by text`.

Rows are append-only and deduplicated by an external event key when supplied or by publication + event type + evidence hash. Each revision gets a new HubSpot quote identity; prior quotes are not overwritten.

#### `quote_customer_acceptances`

- `id uuid`.
- `publication_id uuid`.
- `revision_id uuid`.
- `hubspot_quote_id text`.
- `acceptance_event_type text`: `accepted | revoked | voided | disputed | expired | superseded`.
- `accepted_at timestamptz`.
- `accepted_by_name text nullable`.
- `source text`: `hubspot_webhook | hubspot_poll | manual_verified`.
- `source_event_id text nullable`.
- `evidence_hash text`.
- `evidence_json jsonb`.

Rows are append-only source observations. Deduplicate with a unique source-event key when present and otherwise with `(hubspot_quote_id, acceptance_event_type, accepted_at, evidence_hash)`. Effective acceptance is derived from event order; a later revoked/voided/expired/superseded event blocks readiness if it occurs before actual release. If it occurs after actual release, Tracker records a critical post-release exception and requires a new halt/cancellation decision—historical release evidence is not rewritten.

### 7.9 Operational release

#### `project_release_reviews`

- `id uuid`.
- `workspace_id uuid`.
- `revision_id uuid`.
- `project_id text nullable`.
- `review_number integer`.
- `supersedes_review_id uuid nullable`.
- `readiness_manifest jsonb`.
- `readiness_status text`: `pending | ready | blocked | exception`.
- `readiness_confirmed_by`, `readiness_confirmed_at`.
- `release_approval_status text`: `pending | approved | rejected | revoked`.
- `release_approved_by`, `release_approved_at`.
- `release_status text`: `not_released | released | blocked | halted | cancelled`.
- `released_by`, `released_at`.
- `manifest_hash text`.
- `blocking_exceptions jsonb`.

Each saved review creates a versioned row. Once readiness is confirmed, its manifest and hash are immutable. The workspace stores only a mutable pointer to the current review. Approval and release append workflow events against the exact review ID/hash.

Required readiness manifest:

- exact customer-accepted publication/revision;
- linked HubSpot deal;
- Tracker project/job identity or approved project-creation input;
- assigned PM;
- Build Item identity, numbering, description, quantity, and production notes;
- quoted labor allocation completeness;
- install/dismantle separation;
- unresolved formula/input exceptions;
- QBT provisioning inputs and mapping plan; completion is checked after approval and before actual release;
- BILL provisioning inputs and roster; completion or Paul-approved exception is checked after approval and before actual release;
- schedule and required evidence/drawings;
- known scope changes and release notes.

### 7.10 QBT mapping and imported labor lineage

#### `work_package_qbt_mappings`

- `id uuid`.
- `project_id text`.
- `work_package_id uuid`.
- `qbt_jobcode_id text`.
- `build_item_field_id text not null default '2883322'`.
- `build_item_customfielditem_id text nullable`.
- `build_item_label text`.
- `service_item_field_id text not null default '957306'`.
- `legacy_type_of_work_field_id text nullable default '2883364'`.
- `work_type_id uuid nullable`.
- `mapping_status text`: `planned | provisioned | verified | drifted | archived | failed`.
- `last_verified_at timestamptz nullable`.
- `raw_readback jsonb`.
- Unique active mapping by `(project_id, work_package_id, work_type_id)`.

QBT labels are display data, never the canonical key.

#### Extend `qbo_labor_entries`

Add raw/source projection fields:

- `qbt_build_item_field_id text nullable`.
- `qbt_build_item_customfielditem_id text nullable`.
- `qbt_build_item_label text nullable`.
- `qbt_type_of_work_field_id text nullable`.
- `qbt_type_of_work_item_id text nullable`.
- `qbt_type_of_work_label text nullable`.
- `source_payload_hash text nullable`.
- `source_updated_at timestamptz nullable`.
- `work_package_id uuid nullable`.
- `work_type_id uuid nullable`.
- `coding_status text`: `resolved | unassigned | ambiguous | invalid_mapping | corrected`.

Also remove the historical `hourly_rate DEFAULT 30` behavior. New imports use nullable rates plus existing `rate_source` and `rate_verified_at` provenance; a rate contributes to actual cost only when its source is approved and verified for the work date. Existing `$30` rows are not mass-nullified blindly: an idempotent audit classifies them as verified, unverified, or exception based on provenance, and unverified values are excluded from actual-cost totals.

#### `labor_entry_import_versions`

Append every materially distinct source payload observation:

- `id uuid`.
- `qbo_entry_id text`.
- `source_payload_hash text`.
- `source_payload jsonb`.
- `observed_at timestamptz`.
- Unique `(qbo_entry_id, source_payload_hash)`.

#### `labor_coding_corrections`

Append-only overlay:

- `id uuid`.
- `qbo_entry_id text`.
- `from_work_package_id uuid nullable`.
- `to_work_package_id uuid nullable`.
- `from_work_type_id uuid nullable`.
- `to_work_type_id uuid nullable`.
- `reason text`.
- `corrected_by`, `corrected_at`.
- `supersedes_correction_id uuid nullable`.
- `evidence_json jsonb`.

The raw imported record remains visible. Reports use the latest approved correction overlay and expose that a correction occurred.

### 7.11 Post-mortem and reviewed lessons

Keep `project_postmortems` as immutable source snapshots. Extend its source manifest to include:

- accepted quote publication and revision IDs;
- released manifest hash;
- work-package baseline and authorization rows;
- actual labor import versions and correction overlays;
- coding completeness;
- forecast history;
- rate provenance/completeness;
- outstanding material-invoice status.

#### `ada_reviewed_lessons`

- `id uuid`.
- `project_id text`.
- `postmortem_id uuid`.
- `work_package_id uuid nullable`.
- `lesson_type text`.
- `lesson_json jsonb`.
- `source_refs jsonb`.
- `confidence text`.
- `completeness_status text`.
- `review_status text`: `draft | approved | rejected | withdrawn | expired`.
- `reviewed_by`, `reviewed_at`.
- `valid_from`, `valid_until nullable`.
- `supersedes_lesson_id uuid nullable`.

Ada retrieval includes only `approved` lessons inside their validity period with sufficient completeness.

---

## 8. Financial and metric contracts

### 8.1 Locked meanings

- `$125/hour` — current v8 external/client design rate.
- `$41/hour` — current Tracker internal labor budget/display rate.
- `$105/hour` — existing quoted labor-rate/formula context in Tracker’s legacy decoder/current formula path.
- `$22–$25/hour` — not approved and must not appear as a formula default.
- Actual labor cost — calculated direct base wage cost from verified employee pay rates.

No migration should overwrite one meaning with another.

### 8.2 Required reported values

For each Project × Build Item × Type of Work:

```text
Original allowed hours
+ Approved customer-change hours
= Current authorized hours
Pending/disputed hours                 [separate]
Internal/non-billable hours            [separate]
Forecast total hours                   [latest snapshot]
Actual regular hours
Actual overtime hours
Actual total hours
Remaining authorized hours
Variance vs original baseline
Variance vs current authorized scope
Internal rework hours
Coding completeness
```

### 8.3 Formulas

```text
current_authorized_hours
  = original_baseline_hours
  + approved_customer_change_hours

remaining_authorized_hours
  = current_authorized_hours
  - actual_total_hours

variance_vs_original
  = actual_total_hours
  - original_baseline_hours

variance_vs_current_authorized
  = actual_total_hours
  - current_authorized_hours
```

Pending/disputed and internal/non-billable rows do not silently increase authorized customer scope.

### 8.4 Incomplete data behavior

- Unresolved labor coding is excluded from clean Build Item variance and shown as an exception total.
- Unverified pay rates block actual-cost completeness and AI-training eligibility.
- Outstanding material invoices do not block labor completion but mark the post-mortem financially incomplete.
- No zero or fallback should masquerade as verified data.

---

## 9. Permission matrix

Capabilities must be server-enforced and configured through `user_roles` or a normalized capability table, not hard-coded in components.

| Action | Estimator/editor | PM | Paul/commercial approver | Rooster/operations | Admin/system |
|---|---:|---:|---:|---:|---:|
| Create Quote Workspace | Yes | Yes | Yes | Optional | Yes |
| Edit draft inputs/Build Items | Yes | Yes | Yes | Yes | Yes |
| Submit revision for review | Yes | Yes | Yes | Yes | Yes |
| Commercially approve revision | No | No | **Yes** | No | Break-glass only |
| Publish approved revision | Requested by authorized operator | Requested | Yes | No | Service executes |
| Record manual verified customer acceptance | No | Yes with evidence | Yes | No | Yes |
| Confirm production readiness | No | Consulted | May inspect | **Yes** | Break-glass only |
| Approve operational release | No | No | **Yes** | No in v1 | Break-glass only |
| Execute operational release | No | No | May approve, not default executor | **Yes** | Break-glass only |
| Request change | Yes | **Yes** | Yes | Yes | Yes |
| Approve customer/commercial change | No | No | **Yes** | No | Break-glass only |
| Classify operational cause | No | Supplies context | No | **Yes** | Break-glass only |
| Correct labor coding | No | Request | No | Yes | Yes |
| Approve post-mortem | No | Review | Yes | Yes | Yes |
| Approve Ada lesson | No | Propose | **Yes or designated reviewer** | Propose | Yes |

Break-glass actions require a reason and event entry. Implementation must resolve exact user identities before seeding capabilities; do not guess emails or initials.

---

## 10. API contracts

### 10.1 Quote Workspace

- `GET /api/quote-workspaces`
- `POST /api/quote-workspaces`
- `GET /api/quote-workspaces/[workspaceId]`
- `PATCH /api/quote-workspaces/[workspaceId]`
- `POST /api/quote-workspaces/[workspaceId]/archive`
- `GET|PUT /api/quote-workspaces/[workspaceId]/members`

The existing `/api/ada/workspaces/*` routes remain compatibility adapters until the Quote Workspace routes and UI are verified.

### 10.2 Proposals and revisions

- `POST /api/quote-workspaces/[workspaceId]/proposals`
- `POST /api/quote-workspaces/[workspaceId]/proposals/[proposalId]/accept`
- `POST /api/quote-workspaces/[workspaceId]/proposals/[proposalId]/reject`
- `POST /api/quote-workspaces/[workspaceId]/proposals/[proposalId]/accept-edited`
- `GET|POST /api/quote-workspaces/[workspaceId]/revisions`
- `GET /api/quote-workspaces/[workspaceId]/revisions/[revisionId]/diff`
- `POST /api/quote-workspaces/[workspaceId]/revisions/[revisionId]/submit`
- `POST /api/quote-workspaces/[workspaceId]/revisions/[revisionId]/commercial-approve`

A proposal never mutates an approved revision. Accepting or editing a proposal creates a new immutable revision.

### 10.3 HubSpot

- `POST /api/quote-workspaces/[workspaceId]/revisions/[revisionId]/publish`
- `GET /api/quote-workspaces/[workspaceId]/publications`
- `POST /api/webhooks/hubspot/quotes`
- `POST /api/cron/reconcile-quote-publications`

Publication rules:

1. Validate actor and exact revision status.
2. Create a publication record and outbox command in one database transaction.
3. Build customer-safe line payload—never include internal budgets, hours, margin, wage cost, or production notes.
4. Create a new HubSpot quote associated to the explicitly linked deal.
5. Capture external quote and line IDs.
6. Read back status, association, line order, amounts, total, revision identifier, and timestamp.
7. Compare canonical manifest/hash.
8. Mark `verified` only on exact match; otherwise mark `drifted` or failed.

Webhook/poller acceptance is idempotent and binds to `hubspot_quote_id + revision_id`.

### 10.4 Operational release

- `GET|PUT /api/quote-workspaces/[workspaceId]/release-review`
- `POST /api/quote-workspaces/[workspaceId]/confirm-readiness`
- `POST /api/quote-workspaces/[workspaceId]/approve-release`
- `POST /api/quote-workspaces/[workspaceId]/release`

Release executes one idempotent application service that:

1. `approve-release` revalidates customer acceptance and manifest hash, creates/links a Pending Tracker project, preserves existing non-`TBD` PM ownership, materializes Build Items/baseline authorizations, and enqueues QBT/BILL commands in one transaction.
2. Destination workers persist read-back independently. Partial failure leaves `release_approved_pending_provisioning`; retry resumes by destination-specific idempotency key.
3. `release` rechecks the exact review/hash and required destination states, rejects any blocker, then appends `operationally_released` and promotes the project to Active in one transaction.

Canonical release is never reported while required provisioning is partial.

### 10.5 QBT pilot and labor reconciliation

- `GET /api/admin/workforce-pilot/projects/[projectId]`
- `POST /api/admin/workforce-pilot/projects/[projectId]/preview`
- `POST /api/admin/workforce-pilot/projects/[projectId]/apply`
- `POST /api/admin/workforce-pilot/projects/[projectId]/verify`
- Extend `POST /api/tsheets/sync-labor`.
- Extend `GET|POST /api/admin/labor-reconciliation`.

`preview` performs no external write. `apply` requires a named pilot project and explicit confirmation. `verify` reads exact QBT configuration back.

Canonical v1 labor-coding key:

```text
qbt_jobcode_id
+ exact Build Item label observed under field 2883322, resolved through a versioned field-item snapshot
+ exact Service Item label observed under field 957306, resolved through a versioned field-item snapshot
→ project_id + work_package_id + work_type_id
```

Release 0 read-only payload proof showed that QBT timesheet `customfields` are keyed by the immutable field IDs but contain labels or empty strings, not custom-field item IDs. Tracker therefore snapshots each field's item ID ↔ exact label mapping and resolves observed labels only by exact versioned lookup; it never parses a label to infer project or work-package identity. Field `957306` supplies the semantic **Type of Work** in the v1 pilot even if its live label still says `Service Item`. Field `2883364` is captured raw when present but is neither required nor allowed to substitute for an unmapped `957306` value. If both are present and disagree, the row is `ambiguous`. A missing, empty, duplicate, or unmapped Build Item or Service Item leaves `coding_status` unresolved.

### 10.6 Reporting, post-mortem, lessons

- `GET /api/projects/[id]/work-packages`
- `GET /api/projects/[id]/work-package-labor`
- `POST /api/projects/[id]/labor-authorizations`
- `POST /api/projects/[id]/labor-forecasts`
- Extend `/api/projects/[id]/postmortem/*`.
- `GET|POST /api/projects/[id]/lessons`
- `POST /api/projects/[id]/lessons/[lessonId]/approve`
- `POST /api/projects/[id]/lessons/[lessonId]/withdraw`

---

## 11. Product surfaces

### 11.1 Quote library and workspace

Create `/quotes` and `/quotes/[workspaceId]` as the product-facing route. Keep `/ada` as a compatibility redirect during rollout.

Use the existing calm, chat-first workspace. Do not expose “Concepts” as a primary workflow. Required panes:

- collapsible Quote Workspace library;
- persistent conversation;
- on-demand evidence viewer;
- on-demand quote/revision canvas;
- structured proposal/revision diff;
- approvals/publication/release timeline.

### 11.2 Quote revision editor

Table-first, not stacked cards:

- Commercial Lines tab.
- Build Items tab.
- Labor Allocation tab.
- Assumptions/Exceptions tab.
- Revision History tab.

The interface must show mapped/unmapped commercial lines, child Build Items, quantities, quoted hours, materials/other budget, and production notes.

### 11.3 Release review

One review surface with separate controls and audit labels:

1. Commercial approval — Paul.
2. HubSpot publication/read-back.
3. Customer acceptance.
4. Production readiness — Rooster.
5. Operational-release approval — Paul in normal v1 operation; admin break-glass only with reason.
6. Operational release — Rooster.
7. QBT and BILL provisioning status.

Never collapse these into one `Approved` or `Release` button.

### 11.4 Project Quote Allocation

Quote Allocation stays primary and displays rows:

- Item number.
- Build Item description.
- Quantity.
- Type of Work.
- Original allowed hours.
- Approved additions.
- Current authorized hours.
- Actual hours.
- Remaining hours.
- Forecast.
- Variance.
- Coding status.
- Operational cause/change status.
- Source revision/change reference.

Hours come before dollar values. Budget Detail remains a roll-up.

### 11.5 Worker map

For Option A pilot, add a mobile-friendly read-only map:

- project/job;
- item number + description;
- planned Types of Work;
- production notes;
- current status;
- optional drawing/evidence links.

Do not expose margin, quote sell, wage rates, or employee performance judgments.

---

## 12. Integration behavior

### 12.1 HubSpot publication

Implementation target: new helper `src/lib/hubspot-quotes.ts` using the existing paced/retry-aware HubSpot request layer in `src/lib/hubspot.ts`.

- Do not overwrite an earlier customer quote.
- Do not rank or publish draft/unapproved local revisions.
- Persist exact line ordering and IDs.
- Treat HubSpot response success as incomplete until read-back matches.
- Reconciliation may repair missing read-back state but may not silently replace Tracker’s approved revision.

### 12.2 Customer acceptance

Before coding, probe the actual HubSpot quote API/webhook payload and identify the exact status/property/event for accepted, voided, expired, and superseded quotes. Capture a sanitized fixture. If event delivery is incomplete, use webhook plus bounded poll reconciliation.

Manual acceptance is permitted only as `manual_verified` with evidence and an authorized actor; it is not a plain status toggle.

### 12.3 QBT/Workforce pilot

Current live fields:

- Build Item `2883322` — required, visible, choices `Item 01`–`Item 25`.
- Service Item `957306` — required and visible; Tracker reads it as `service_item`.
- Type of Work `2883364` — optional and not visible to everyone.

Release 0 confirmed that labor payload values for these fields are labels or empty strings. The immutable field IDs remain stable payload keys; custom-field item IDs are retained in the separately versioned configuration snapshot and cannot be assumed to appear on a timesheet.

Pilot plan:

1. Use one controlled pilot project.
2. Start with reusable Item 01–25 plus the Tracker worker map.
3. Separately test project-specific descriptive values such as `26188 · 01 · Lower Walls` without rolling them broadly into production.
4. Test jobcode filtering, mobile display, same-job switching, persistence, offline synchronization, edits/corrections, API payloads, QBO export, and archival.
5. Do not expose both Service Item and Type of Work when they are semantically redundant.
6. A label-only rename of field `957306` is a separate gated experiment; changing its choices is a separate mapping project.

The pilot fails if a worker cannot consistently produce a resolvable `project + work_package + work_type/service_item` record with minimal selections.

### 12.4 BILL

- Paul remains budget owner/approver.
- Members: Emily; David Mendoza through `production@meccadesign.com`; Caleb McCallum/Rooster; assigned PM.
- Non-owner members remain request-based with zero limits and `shareBudgetFunds: false` unless separately approved.
- Existing non-`TBD` Tracker PM values remain authoritative.
- BILL-managed amount remains the current approved category scope (`budget_travel + budget_props`) until policy changes.
- New governed projects provision/reconcile BILL after Paul approves release and before Rooster records actual operational release—not from a draft, merely Closed Won event, or unapproved readiness review.
- Existing legacy webhook behavior remains behind a compatibility flag until every new path is proven.
- Creation/update requires exact member read-back; warnings remain visible rather than false success.

### 12.5 Legacy-path cutover

Existing surfaces remain operational until the governed replacements prove parity:

- `POST /api/ada/workspaces/[workspaceId]/revisions/[revisionId]/accept` becomes a compatibility wrapper around the new approval service, then redirects consumers to `/api/quote-workspaces/...`.
- `POST /api/webhooks/hubspot` keeps legacy Closed Won project/BILL creation only for deals with no governed workspace/release link and while `LEGACY_CLOSED_WON_PROJECT_CREATION_ENABLED` is true.
- `GET|POST /api/projects/[id]/quote-allocation` reads the new work-package summary when a released manifest exists and preserves the legacy line-item path otherwise.
- `GET|POST /api/projects/[id]/bill-budget` remains the manual recovery/reconciliation surface; governed automatic provisioning runs through outbox commands.
- `/ada` redirects to `/quotes`; existing workspace IDs and conversation/history URLs remain resolvable.

Cutover order:

1. Shadow-write/compare normalized revisions without changing reads.
2. Switch Quote Workspace reads only for rows with `normalization_status = normalized`.
3. Route approval/publication/release through shared application services.
4. Enable governed flow for named pilot workspaces only.
5. Compare project, Build Item, quote-allocation, QBT, and BILL outputs against the legacy path.
6. Stop legacy Closed Won creation for governed deals.
7. Remove wrappers/flags only after zero active governed records depend on the legacy behavior and reconciliation is clean for an agreed observation window.

Rollback disables the affected feature flag and returns new workspaces to the last proven read path; it never deletes normalized snapshots or external evidence already created.

---

## 13. Failure, retry, and concurrency contracts

- Every external mutation uses an idempotency key based on aggregate + revision + operation.
- The full key is destination + aggregate type/ID + revision/amendment ID + operation + semantic target ID. Reusing a key with a different payload hash is a terminal conflict, not an update.
- A unique database constraint prevents duplicate publication/release/provisioning commands.
- `processing` outbox rows have lease expiry and can be safely reclaimed.
- Retry only bounded transient classes: rate limits, timeouts, and 5xx responses.
- Validation, permission, mapping, and manifest mismatches are terminal/review-required.
- Store sanitized error codes/messages; never persist credentials or raw authorization headers.
- Optimistic concurrency rejects stale workspace/revision edits with HTTP 409 and returns current row version.
- External drift creates a review exception; no bidirectional last-write-wins overwrite.
- Partial downstream provisioning does not falsify canonical release state. Each destination has its own status and retry.
- A worker claims an outbox row with `lease_owner` and `lease_expires_at`; success writes external identity/read-back before completion. A process crash after external creation re-enters through read-before-create reconciliation, not blind recreation.
- Cancellation/voiding appends events and external actions; it never deletes accepted/released evidence.

---

## 14. Privacy and security

- All browser routes require authenticated server checks.
- Workspace access uses explicit membership and capabilities.
- Service-role clients stay server-only.
- Service-role possession is not authorization. Every privileged route resolves the authenticated actor, runs the centralized capability decision, writes the actor/reason to the event ledger, and only then calls a service-role persistence helper. Tests must prove direct wrong-role calls fail even though the server process can bypass RLS.
- RLS policies mirror application membership rules.
- Internal cost, margin, quote intelligence, and production notes are excluded from HubSpot customer payloads.
- Employee pay rates and actual wage costs are limited to authorized financial/admin surfaces.
- Worker-facing surfaces never expose wage rates or individual performance scoring.
- Evidence URLs remain private/signed.
- AI prompts receive only authorized, minimized evidence.
- Logs/events store credential placeholders only; **credentials must be represented as `[REDACTED]`**.

---

## 15. Required scenario tests

Automate the six domain scenarios in `src/lib/quote-to-production-scenarios.test.ts`. Scenario 5 also requires the real-device pilot evidence defined in Release 6; Scenario 6 also requires a post-mortem fixture test.

### Scenario 1 — One commercial line creates five Build Items

- One customer line is mapped explicitly to five work packages.
- Allocations are not implicitly equal.
- Commercial total remains one line; production handoff contains five stable IDs.

### Scenario 2 — Twelve identical pedestals

- One Build Item has quantity 12.
- Item identity is not duplicated twelve times by default.
- Quoted and actual hours can be reported per package and normalized per unit.

### Scenario 3 — Customer adds two items after production begins

- Original baseline remains unchanged.
- New revision/amendment and two new work packages are created.
- Approved customer-change authorization increases current authorized hours.
- HubSpot publication appends a new customer quote/change artifact.

### Scenario 4 — Internal remake

- Remade work remains tied to the original or explicit child/remake work package.
- Additional hours use `internal_nonbillable + production_rework_quality`.
- Customer-authorized scope does not increase.

### Scenario 5 — Three workers switch between two Build Items

- Every source time entry resolves to the correct project, Build Item, and Type of Work.
- Same-job switching, persistence, and correction lineage are verified on mobile.
- No worker is asked to classify variance cause.

### Scenario 6 — Labor complete; material invoices outstanding

- Labor completion and labor variance are available.
- Project/post-mortem is marked financially incomplete.
- Ada lesson approval remains blocked or explicitly limited until completeness policy is satisfied.

---

## 16. Definition of done by release

### Release 0 — Baseline and proof fixtures

**Goal:** Make existing reds and external uncertainty explicit before schema work.

**Files:**

- Fix or re-baseline `src/lib/hubspot-quote-parser.test.ts` only after confirming the intended 244-vs-95 contract.
- Fix the stale source assertion in `tests/bill-budget-pm-mapping-contract.test.mjs`.
- Create `tests/fixtures/hubspot-quote-publication/` with sanitized request/read-back fixtures.
- Create `tests/fixtures/qbt-work-package-pilot/` with sanitized custom-field/timesheet fixtures.
- Create `docs/research/2026-09-03-hubspot-quote-acceptance-probe.md`.

**RED:** Add contract tests that prove no production publication/release path exists yet.  
**GREEN:** Add only fixtures/probe documentation and settle pre-existing expectations.  
**Verify:** focused tests and `npm run build` pass from the clean baseline.

**Go gate:** HubSpot acceptance signal and QBT payload fields are proven from real read-only responses.

**Release 0 result — completed 2026-09-03:**

- Re-baselined the quote parser to the approved `$105/hour` quoted-labor context: `$10,000 / $105 = 95` rounded hours. No production formula changed.
- Updated the BILL PM mapping contract to follow the secured admin API, where email normalization now occurs.
- Cleared six additional stale full-suite contracts left behind by deliberate later refactors: Supabase test bootstrap, single-action completion, modal project notes, shared July labor review helper, removed allocation-mapping editor, and AppShell-owned width.
- Added sanitized read-only HubSpot and QBT fixtures plus `tests/release0-quote-to-production-contract.test.mjs`; the guard proves Release 0 added no publication, acceptance, release-approval, or operational-release mutation route.
- HubSpot publication read-back is proven (`PUBLISHED`, exact deal association, ordered line-item association shape). The account exposes `ACCEPTED` in `hs_quote_status`, but the read-only probe found zero current accepted quotes and no accepted-date/acceptance-method history. Automatic acceptance ingestion remains blocked pending a controlled lifecycle pilot.
- QBT field/configuration and timesheet shapes are proven. Timesheet custom-field values are labels or empty strings under immutable field IDs, not custom-field item IDs; later mapping must use exact labels against a versioned field-item snapshot.
- Verification: all 208 discovered test files passed (`437/437` tests), `npm run build` passed with `49/49` static pages, `git diff --check` passed, and all three fixture files passed credential-pattern scanning.
- No live QBT configuration, HubSpot quote, Tracker production record, database schema, BILL record, deployment, or service process was changed.

### Release 1 — Canonical schema and authorization

**Goal:** Create normalized, immutable Quote Workspace, Build Item, workflow, and outbox foundations.

**Create:**

- `supabase/migrations/20260903100000_quote_to_production_foundation.sql`
- `supabase/migrations/20260903101000_quote_workspace_memberships.sql`
- `supabase/migrations/20260903102000_quote_workflow_events_and_outbox.sql`
- `supabase/migrations/20260903103000_quote_normalized_backfill.sql`
- `src/lib/quote-domain.ts`
- `src/lib/quote-permissions.ts`
- `src/lib/quote-domain.test.ts`
- `src/app/quotes/quote-schema.contract.test.ts`

**Modify:**

- `src/lib/ada-server.ts` to delegate workspace authorization to shared membership logic.
- `src/lib/types.ts` with UI-safe domain types only; do not expose restricted wage fields globally.

**TDD sequence:** migration source contract → pure state transition tests → permission tests → minimal schema/helpers → remote schema verification. Permission RED cases call every privileged operation with estimator, PM, Paul, Rooster, and admin actors and assert the matrix's allowed/403 outcome; service-role helpers are not directly routable.

**Migration/backfill sequence:**

1. The three DDL migrations are rerunnable and contain named constraints, append-only triggers, capability-aware RLS, and explicit replacements for legacy cascade/authenticated-wide policies.
2. The backfill migration creates `quote_revision_normalization_exceptions` and converts existing `ada_quote_revisions.quote_json` in deterministic revision batches.
3. Valid rows receive normalized child rows, a manifest hash, `normalization_status = normalized`, and `normalized_at`.
4. Missing/ambiguous commercial lines, duplicate work-package numbers, or unallocatable trade totals create exception rows and remain on legacy JSON reads; no value is guessed.
5. Re-running the backfill is idempotent by revision ID + source hash. A changed source hash after normalization becomes `mismatch` and requires review.
6. Application dual-write compares legacy JSON against normalized rows before any read cutover. Approval remains blocked until the normalized manifest hash is stable.

**Verify:**

```bash
node --import tsx --test src/lib/quote-domain.test.ts src/app/quotes/quote-schema.contract.test.ts
npm run build
supabase migration list --linked
```

Apply schema only after remote prerequisite checks. Re-query tables, columns, constraints, RLS, and functions before restarting code.

**Go gate:** Unauthorized workspace access fails server-side; immutable revision constraints reject post-lock updates; state-transition tests cover every gate.

**Release 1 completion status — 2026-09-04:** The four Release 1 migrations, canonical domain/permission helpers, normalized legacy backfill, governed compatibility RPCs, membership-aware Ada routes, immutable evidence ledger, and durable outbox are implemented and applied to the linked Supabase database. Workspace creation is capability-gated and atomic across the workspace, owner membership, compatibility concept, and `workspace_created` event; workspace discovery is based on active membership rather than creator identity. The final independent read-only security/specification gate passed with no P0/P1 blockers. Local verification passed with 478/478 tests across 218 files, the disposable PostgreSQL migration/security/rerun harness (`release1_sql_harness_ok`), a production build with 49/49 static pages, TypeScript and diff checks, and zero credential-pattern hits across 62 changed text files. Exact remote verification passed: all four `2026090310*` versions are recorded; all 11 Release 1 tables and 16 terminal-archive triggers are present; legacy counts remain 8 workspaces, 8 revisions, and 41 events; all 8 revisions normalized with zero `needs_review` or `mismatch`; and the backfill produced 62 commercial lines, 62 line mappings, 39 revision work-package snapshots, and 32 stable work packages. No application deployment/restart, migration-history drift repair, or QBO/QBT/BILL configuration change was included.

### Release 2 — Normalized revisions and structured proposals

**Goal:** Make commercial lines, Build Items, labor allocations, and Ada proposals reviewable and revision-safe.

**Create:**

- `src/lib/quote-revision-normalizer.ts`
- `src/lib/quote-revision-validator.ts`
- `src/lib/quote-proposals.ts`
- corresponding runtime tests.
- `src/app/api/quote-workspaces/[workspaceId]/proposals/*`
- `src/app/api/quote-workspaces/[workspaceId]/revisions/*`
- `src/components/quote-workspace/*`
- source contracts under `src/app/quotes/`.

**Modify:**

- `src/lib/ada-quote-revisions.ts` to create proposals/revisions through shared services.
- `src/app/api/ada/workspaces/[workspaceId]/messages/route.ts` so Ada creates a proposal, not a silently accepted canonical revision.
- `src/components/ada-workspace-detail.tsx` and `src/components/ada-quote-canvas.tsx` to use the new review flow.

**RED cases:**

- accepted proposal creates exactly one new revision;
- rejected proposal changes no revision;
- edited acceptance persists the human edit and proposal lineage;
- new revision invalidates prior draft approval without deleting it;
- line ↔ Build Item allocation is explicit;
- aggregate-only trade hours remain `unallocated`;
- stale `row_version` returns conflict.

**Go gate:** A user can import/create a quote, review an Ada proposal as a structured diff, and produce an immutable normalized revision without any HubSpot/project dependency.

**Release 2 completion status — 2026-09-10:** The proposal-disposition domain, immutable proposal persistence, actor-scoped governed APIs, proposal-first atomic Ada chat finalization, and responsive human review UI are implemented on `wip/quote-to-production-release-2`. Application conflicts use non-retryable `PT409`; chat-created proposals remain immediately disposable; independently selectable pending proposals retain their source-derived structured delta after creation and reload; and accept, edit-and-accept, and reject preserve immutable source/proposal lineage. Linked Supabase records migrations `20260908152000`, `20260909221000`, and `20260910102500`. Controlled production E2E proved one rejection with no revision and one edited acceptance through the real authenticated UI: proposal `b36f5305-bf3d-4db3-93ba-7a9d1fd2b905` preserved its `$3,401` proposal snapshot, persisted the human-edited `$3,402` snapshot, and created exactly one locked normalized Revision 2 (`90d427e9-5024-4d01-b1cb-4bbc5f07e99d`) from unchanged Revision 1. Baseline/final counts were 1→2 revisions, 3→4 proposals, 4→8 workflow events, and 0→0 outbox rows; the exact event sequence was `proposal_created`, `proposal_edited`, `revision_created`, `proposal_accepted`. Revision 2 normalized to eight commercial lines, eight stable Build Items, and eight explicit line-to-Build-Item mappings totaling `$21,002`. The fixture contained no structured `quotedHours`, so normalization truthfully created zero labor-allocation rows rather than inferring hours from prose. Commercial approval, HubSpot publication, customer acceptance, Tracker project creation, project-linked Build Items, QBT/QBO/BILL provisioning, and operational release all remained absent. Final local gates passed 439/439 tests across 182 files, TypeScript, `git diff --check`, and a 49/49-page production build; local/public routes and all 23 referenced assets passed after restarting only PM2 `mdp-tracker`. Release 2's go gate is satisfied, and the release branch was fast-forwarded into `main` and pushed at `47f400a8d44b4a47dd4b59d8a7fe33e28ea59e17`.

### Release 3 — Product-facing Quote Workspace

**Goal:** Promote the Quote Workspace to a Tracker feature rather than an Ada-owned screen.

**Create/modify:**

- `src/app/quotes/page.tsx`
- `src/app/quotes/[workspaceId]/page.tsx`
- `src/components/quote-workspace/quote-library.tsx`
- `src/components/quote-workspace/quote-workspace.tsx`
- `src/components/quote-workspace/commercial-lines-table.tsx`
- `src/components/quote-workspace/build-items-table.tsx`
- `src/components/quote-workspace/labor-allocation-table.tsx`
- `src/components/quote-workspace/revision-timeline.tsx`
- `src/components/Sidebar.tsx`
- compatibility redirects under `src/app/ada/`.

**RED contracts:** navigation/access, independent pre-project creation, persistent draft switching, archive-not-delete, table labels, responsive layout, no Concepts primary UI.

**Go gate:** Paul/estimators can understand current revision, exceptions, Build Items, and approval state without opening a spreadsheet or Ada-only route.

**Release 3 Slice 1 implementation checkpoint — 2026-09-10:** The product-facing route foundation is live from `wip/quote-to-production-release-3`. Tracker now exposes a normalized-access-gated `/quotes` library and `/quotes/[workspaceId]` standalone workspace, a membership/capability-aware Quotes sidebar entry, member-scoped search and lifecycle filtering, responsive mobile rows and desktop table presentation, and pre-project quote creation through the existing governed `create_quote_workspace` RPC. `/api/quote-workspaces` provides compatibility aliases over the proven governed workspace handlers, while `/ada` and `/ada/[workspaceId]` preserve existing links by redirecting to the new product routes. The standalone workspace deliberately reuses the already-proven conversation, evidence, proposal, and immutable-revision editor; no approval, publication, project creation, provisioning, readiness, or release behavior changed. TDD captured a four-contract RED before implementation. Final gates passed 443/443 source tests, TypeScript, `git diff --check`, and a production build generating 52 pages; after restarting only PM2 `mdp-tracker`, local/public `/quotes` returned 200, unauthenticated normalized quote APIs returned 401, and all 19 referenced assets loaded from both origin and public hostname. Authenticated browser population/UI verification remains pending because the available browser session reached the Google login wall. Release 3 is not complete: rename plus governed archive/restore, persistent workspace switching, and table-based commercial lines, Build Items, Item × Type-of-Work labor allocations, revision history, exceptions, and approval state remain in subsequent slices before the go gate can pass.

### Release 4 — Commercial approval and HubSpot publication

**Goal:** Publish only locked approved revisions and prove the resulting HubSpot quote.

**Create:**

- `src/lib/hubspot-quotes.ts`
- `src/lib/quote-publication.ts`
- `src/lib/integration-outbox.ts`
- runtime tests.
- publish/publication/reconciliation routes.
- `scripts/reconcile-quote-publications.ts` if the existing cron route cannot own bounded retries cleanly.

**Modify:** `src/lib/hubspot.ts` only to expose shared paced request primitives/properties required by the new helper.

**RED cases:** unapproved revision rejected; wrong deal rejected; duplicate request deduped; internal fields excluded; line order preserved; read-back mismatch becomes `drifted`; accepted webhook deduped; new revision publishes as a new quote.

**Live pilot gate:** One non-customer or explicitly approved test quote is created, associated, read back, compared, and then cleaned up/voided through the approved external workflow. Browser success alone is insufficient.

### Release 5 — Customer acceptance and operational release

**Goal:** Materialize an exact accepted revision into production under separate Paul/Rooster gates.

**Create:**

- `src/lib/quote-release.ts`
- `src/lib/release-readiness.ts`
- tests.
- release-review/readiness/approval/release routes.
- `src/components/quote-workspace/release-review.tsx`
- `src/components/quote-workspace/release-timeline.tsx`
- `supabase/migrations/20260903104000_quote_operational_release.sql`

**Modify:**

- `src/app/api/webhooks/hubspot/route.ts` to preserve legacy project creation behind a compatibility path while governed workspaces use release.
- Project creation/helper code to accept a released manifest.
- `src/lib/billcom-budget.ts` call site so governed creation is release-triggered.

**RED cases:** customer acceptance references exact publication; readiness cannot imply approval; Rooster cannot approve release; Paul’s approval creates one Pending project/manifest and cannot imply actual release; partial QBT/BILL provisioning blocks release; Rooster release requires readiness + Paul approval + required read-backs; duplicate approval/release creates no duplicate project/Build Items/outbox commands; existing non-`TBD` PM is preserved; concurrent releases serialize on workspace/project locks.

**Go gate:** A real pilot moves from accepted quote to a Tracker project with exact work packages and separate audit actors/timestamps.

### Release 6 — Workforce/QBT pilot

**Goal:** Prove the worker flow without disrupting the live process.

**Create:**

- `src/lib/qbt-work-package-mappings.ts`
- `src/lib/workforce-pilot.ts`
- runtime tests.
- admin pilot routes/UI.
- worker map page/components.
- `supabase/migrations/20260903105000_workforce_work_package_mapping.sql` for mappings/import versions/corrections and hourly-rate default remediation.

**Modify:**

- `src/app/api/tsheets/sync-labor/route.ts` to capture Build Item and work-type fields by immutable IDs.
- `src/app/api/admin/labor-reconciliation/route.ts`.
- `src/lib/labor-tie-out.ts`.

**Required real-device matrix:** every phone OS actually used by the pilot cohort (document unused OS classes as not applicable); clock in/out; same-job item switch; next-day persistence; offline/reconnect; manager correction; QBO export/approval; label/read-back persistence; archive behavior.

**Stop conditions:** project filtering fails; hidden/required fields appear unpredictably; workers need redundant classifications; raw payload lacks stable IDs; corrections erase source history; QBO export changes accounting meaning.

**Pilot measurement contract:** Before apply, Paul and Rooster approve the named cohort, device matrix, and sample-size target. Proposed default is at least 30 entries across at least 3 workers, with each production-used phone OS represented. Track denominator as all source entries created in the pilot window; numerator is entries automatically resolved on first import to project + Build Item + work type without human correction.

**Go gate:** Proposed target ≥95% first-import auto-resolution, 100% of unresolved rows visible/correctable, zero erased source histories, and successful QBO export/read-back. Paul and Rooster must confirm the threshold before the pilot starts. No broad Service Item rename yet.

### Release 7 — Allocation reporting and change control

**Goal:** Put hours-first authorized-vs-actual reporting into Project Quote Allocation.

**Create:**

- `src/lib/work-package-labor-summary.ts`
- `src/lib/work-package-labor-summary.test.ts`
- `src/lib/work-package-change-control.ts`
- tests and routes.
- work-package allocation table components.

**Modify:**

- `src/app/projects/[id]/page.tsx`
- existing Quote Allocation route/surface.
- `src/lib/project-overview-summary.ts` only after the detailed metric contract is canonical.

**RED cases:** zero budget; OT included in hours; unresolved coding excluded and surfaced; approved/pending/internal hours stay separate; install/dismantle stay distinct; remake does not raise customer authorization; quantity normalization is accurate.

**Go gate:** Project summary totals reconcile exactly to detailed rows, and the UI never mixes hours with dollars in one percentage.

### Release 8 — Closeout and approved learning

**Goal:** Freeze exact quote-to-actual evidence and gate reusable lessons.

**Create/modify:**

- `supabase/migrations/20260903106000_postmortem_reviewed_lessons.sql` for `ada_reviewed_lessons` and post-mortem linkage.
- `src/lib/project-postmortem.ts`.
- `scripts/generate-completed-project-postmortems.ts`.
- post-mortem routes/components.
- `src/lib/ada-intelligence/gateway.ts` to load only eligible lessons.

**RED cases:** source snapshot contains released manifest; later source edits show freshness drift; missing rates/coding/invoices mark completeness; unapproved/withdrawn/expired lessons are excluded; approved lesson carries sources and reviewer.

**Go gate:** One completed pilot project generates a source-verifiable post-mortem and one human-approved lesson that Ada can retrieve with provenance.

---

## 17. Verification strategy

### 17.1 Test layers

1. Pure domain tests — transitions, formulas, permission decisions, normalization, hashes.
2. Migration/source contracts — tables, constraints, RLS, functions, append-only guards.
3. API contract tests — auth, validation, idempotency, response states.
4. Integration fixture tests — HubSpot/QBT/BILL payload and read-back behavior.
5. Browser E2E — quote creation, proposal review, approval, publication status, release sequence, allocation view.
6. Real-system pilot — HubSpot publication, QBT devices/QBO export, BILL membership/read-back.
7. Post-release reconciliation — outbox backlog, drift, unmapped labor, missing evidence.

### 17.2 Standard command set

`package.json` has no `test` script. Run each release's exact focused files with the repository's existing Node/TSX convention, then build:

```bash
node --import tsx --test src/lib/quote-domain.test.ts src/lib/quote-to-production-scenarios.test.ts
npm run build
git diff --check
```

Before deployment:

```bash
supabase migration list --linked
pm2 describe mdp-tracker
```

After schema apply and service restart:

```bash
pm2 restart mdp-tracker --update-env
curl -I http://127.0.0.1:3004/login
curl -I https://projects.meccadesign.com/login
```

A 200 on `/login` proves route/process health only. Protected, populated workflow verification requires an authenticated browser session and source/read-back checks.

### 17.3 Production rollout sequence

1. Merge tests and dormant schema/helpers.
2. Verify remote prerequisites and apply idempotent migrations.
3. Re-query exact remote schema/RLS/function state.
4. Deploy code with feature flags disabled.
5. Enable read-only Quote Workspace normalization for test workspaces.
6. Enable internal proposal/revision workflow.
7. Enable HubSpot publication for one approved pilot.
8. Enable governed release for one pilot.
9. Run Workforce pilot without broad live terminology changes.
10. Enable reporting after coding completeness meets gate.
11. Enable lesson retrieval only after post-mortem approval proof.
12. Remove compatibility paths only after reconciliation shows no active legacy dependency.

---

## 18. Feature flags and observability

Recommended flags:

- `QUOTE_WORKSPACE_V1_ENABLED`
- `QUOTE_NORMALIZED_REVISIONS_ENABLED`
- `QUOTE_HUBSPOT_PUBLICATION_ENABLED`
- `QUOTE_GOVERNED_RELEASE_ENABLED`
- `WORKFORCE_BUILD_ITEM_PILOT_ENABLED`
- `WORK_PACKAGE_REPORTING_ENABLED`
- `ADA_REVIEWED_LESSONS_ENABLED`

Required operator counts:

- workspaces by lifecycle status;
- revisions needing input/review;
- publications pending/failed/drifted;
- accepted quotes missing release review;
- release reviews blocked by reason;
- QBT mappings planned/verified/drifted;
- labor rows resolved/unassigned/ambiguous/corrected;
- BILL provisioning/read-back warnings;
- post-mortems incomplete by reason;
- lessons draft/approved/withdrawn/expired.

Alert on stuck outbox leases, repeated transient failures, publication drift, acceptance without a matching known publication, released projects without Build Items, and rising unresolved labor coding.

---

## 19. Proposed policy defaults

Items 1–4 are technical/data-integrity rules. Items 5–10 are proposed operating defaults that must be confirmed by Paul/Rooster before their affected release is enabled; they do not block schema/test work:

1. Keep v8 formulas/rates versioned as current policy; do not silently normalize Whatnot defects.
2. Use `USD` only in v1 while storing currency explicitly.
3. One active commercially approved revision per workspace; history remains immutable.
4. One active operationally released revision per project; changes append amendments/authorizations.
5. Build Item numbers are not reused after cancellation within a workspace/project.
6. Project-wide labor uses explicit work packages where genuine:
   - `90 · Project-wide Design`
   - `91 · Production Coordination`
   - `92 · Pull, Pack, and Load`
   - `93 · Installation`
   - `94 · Dismantle`
7. Company overhead uses separate non-project jobcodes.
8. `Unassigned — Needs Review` is an exception state, never a permanent bucket.
9. Build Item materials/subcontractor actual attribution stays null/deferred rather than guessed.
10. Existing historical combined `Install/Dismantle` remains combined unless direct evidence supports correction.

---

## 20. Decisions still required before their specific slice

These do not block Release 0–3:

1. Exact HubSpot accepted/voided/expired event/property contract — resolve in Release 0 probe.
2. Whether Paul alone or Paul plus another named reviewer may commercially approve when Paul is unavailable.
3. BILL top-up, batching, category, and approval-routing policy beyond current travel/props scope.
4. Canonical storage/finalization policy for quote files and whether Ada’s Drive folder remains a working-copy store only.
5. QBT Service Item label rename, duplicate Type of Work retirement, and final worker taxonomy—decide from pilot evidence.
6. Timecard correction cutoff and payroll-period lock behavior.
7. Historical rate effective dates, overtime/holiday/salary rules, and excluded-worker policy for training-grade cost evidence.
8. Post-mortem financial-completeness threshold when invoices remain outstanding.
9. Final Workforce pilot cohort, sample size, device matrix, and whether the proposed ≥95% auto-resolution gate is accepted.

No implementation may fill these gaps with guesses. The affected route remains disabled or returns a clear review-required state.

---

## 21. Final acceptance criteria

The v1 program is complete only when all are true:

- A Quote Workspace can exist before HubSpot or a Tracker project.
- Multiple authorized users can collaborate without owner-email bypasses.
- Every approved revision is immutable and normalized.
- Ada changes are proposals with visible human disposition.
- Commercial lines and Build Items support many-to-many mapping.
- Every Build Item has a stable UUID and contextual item number.
- Item × Type-of-Work quoted allocations are complete or explicitly unresolved.
- Paul’s commercial approval is distinct from publication.
- HubSpot publication is read back and hash/total verified.
- Customer acceptance binds to the exact publication/revision.
- Rooster’s readiness and actual release are distinct from Paul’s approval.
- Released project/Build Item materialization is idempotent.
- Workforce pilot proves the mobile flow without redundant fields or lost correction history.
- Actual labor reconciles to project + Build Item + work type, or appears as an exception.
- Original, approved-change, pending/disputed, internal, forecast, and actual hours remain separate.
- BILL provisioning preserves Paul ownership and the confirmed roster with read-back.
- Post-mortems preserve immutable source evidence and completeness.
- Ada retrieves only individually approved, source-linked, currently valid lessons.
- All focused tests, full tests, build, migration verification, authenticated E2E, and real integration pilots pass.

## Release 3 implementation checkpoint — product Quotes and workspace lifecycle

Release 3 is in progress on `wip/quote-to-production-release-3`. Slices 1 and 2 are implemented and deployed; the table-based review surface remains the next product slice.

Completed local slices:

- Product-facing `/quotes` and `/quotes/[workspaceId]` routes with responsive listing, search, status filtering, pre-project workspace creation, governed conversation/revision reuse, and Ada compatibility redirects.
- Persistent URL-backed workspace switching.
- Workspace rename through an actor-bound title-only RPC so unrelated client/contact/project metadata is not resubmitted or overwritten.
- Governed archive and restore with optimistic concurrency, immutable audit events, exact captured state recovery, idempotent retries, and current authorization checked before replay.
- Archived workspaces hidden by default with an explicit Archived filter and restore action.
- HTTP `409` handling for stale-version, lifecycle, and idempotency conflicts.

Verified on the local Release 3 tree:

- focused workspace-management contract: `5/5`;
- full source suite: `448/448`;
- TypeScript: pass;
- `git diff --check`: pass;
- disposable PostgreSQL 18 migration harness: exit `0`, exactly one `release1_sql_harness_ok` marker;
- isolated Next.js production build with non-secret placeholder public Supabase values: pass, `52/52` pages generated.
- live production build using `.env.local`: pass, `52/52` pages generated;
- linked Supabase migration `20260910143000`: applied and recorded with local/remote history aligned;
- remote read-back: restore and rename RPCs present, authenticated execution allowed, service-role execution denied, capability authorization ordered before replay, 8 workspaces / 8 workflow events / 0 restore events preserved;
- PM2: only `mdp-tracker` restarted, online with zero unstable restarts;
- local and public `/`, `/login`, and `/quotes`: HTTP 200; quote APIs: expected unauthenticated HTTP 401; `/quotes` assets: `19/19` local and `19/19` public.

Open gates:

- Authenticated browser E2E remains incomplete because no authenticated Tracker browser session is available.
- No commercial approval, publication, customer acceptance, project creation, provisioning, production-readiness, operational-release approval, or operational release was exercised.

Next product slice after these gates: the table-based review surface for commercial lines, Build Items, labor allocations, revisions/exceptions, and approval state.
