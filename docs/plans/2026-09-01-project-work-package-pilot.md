# Project Work-Package Labor Pilot

**Date:** 2026-09-01  
**Status:** HubSpot PM propagation and deterministic BILL roster reconciliation deployed; work-package pilot proposed
**Scope:** standardized quote → HubSpot → QuickBooks Time → MDP Tracker → BILL → production closeout

## Confirmed decisions

1. An **item is any discrete labor-bearing work package**, not only a fabricated deliverable.
2. Work-package identity is project-scoped. `Item 01` alone is invalid; the minimum business key is `project_id + item_number`.
3. Resale is not fabrication. Resale-related handling, modification, prep, or test-fit labor may still belong to a work package.
4. Install and dismantle should be distinct labor phases and choices.
5. Design uses the fixed internal/external policy already represented by the current quote/Tracker model:
   - external/client design rate: `$125/hour` (`v8 Settings!B22`);
   - internal budget/display rate: `$41/hour` (`v8 Settings!B7` and existing Tracker labor display schema).
   Actual calculated direct base wage cost remains a separate verified-pay-rate measure.
6. Tracker should preserve the production-facing Budget Handoff display schema:
   - Line item
   - Line type
   - Materials / other budget
   - Hours allowed
   - Notes for production
7. The confirmed BILL roster is:
   - Paul: owner/approver;
   - Emily: owner/admin or backup approver;
   - David: request-based member;
   - Caleb McCallum, also called Rooster: request-based member;
   - assigned PM: request-based member.

## HubSpot → Tracker → BILL rollout — 2026-09-01

- Tracker now requests HubSpot `account_manager` with the deal and resolves it against `user_roles.full_name` / `pm_initials` before inserting the project.
- Approved HubSpot aliases currently cover `Nicholas Gonzales → Nick Gonzales` and `Destiny Freeman → Destiny Gardner`.
- Existing non-`TBD` Tracker PM assignments remain authoritative; existing `TBD` projects can be repaired from HubSpot on the next webhook refresh.
- BILL create/update now reconciles Emily, David (`production@meccadesign.com`), Caleb/Rooster, and the assigned PM as request-based members under Paul as owner.
- Every member PUT is followed by BILL membership read-back. Missing members produce a persisted warning instead of a false success.
- Live proof on budget `26188` read back Paul as `OWNER` and Emily, David Mendoza, Caleb McCallum, and Nick Gonzales as request-based `MEMBER` records with zero limits and `shareBudgetFunds: false`.
- One HubSpot account-manager option remains intentionally unmapped: `Kenneth Mecca`. Tracker already uses `KM` for Kristina Morland, so no initials were guessed.

## Workbook conclusions

The complete workbook audit is in `docs/research/2026-09-01-quote-workbook-audit.md`.

### Source model

`Mecca_Quote_Builder_v8.xlsx` is the current complete structure:

- Settings
- Travel Estimator
- Takeoffs
- Quote Builder
- Client Quote
- Budget Handoff
- Legacy Decoder

The filled Whatnot workbook is an older reduced variant. It lacks the v8 Travel Estimator, embedded resale classification, and Event/Off Days line.

### Work-package structure

- Quote Builder rows `5:19` provide 15 named item/work-package slots despite the instruction saying Item 1–10.
- Takeoffs rows provide the proto-BOM and labor-task detail grouped by exact work-package name.
- Budget Handoff provides the production summary but only total hours per item.
- Trade/task is currently free text in Takeoffs descriptions rather than a canonical field.
- A clean Item × Trade allocation therefore cannot be recovered reliably without adding structured trade/task data.

### Required quote contract additions

Every approved work package should preserve:

- immutable Tracker work-package UUID;
- project ID/job number;
- item number;
- item description;
- line type;
- resale/procurement classification;
- materials/other budget;
- total quoted hours;
- quoted hours by canonical trade/phase;
- production notes;
- source workbook/revision;
- approved/final timestamp and approver.

Changing an item description must not change its identity.

## Live QuickBooks Time findings

### Existing custom fields

#### Build Item

- Field ID: `2883322`
- Active: yes
- Required: yes
- Visible to all: yes
- Managed choices: `Item 01` through `Item 25`

#### Type of Work

- Field ID: `2883364`
- Active: yes
- Required: no
- Visible to all: no
- Current choices:
  - Carpentry
  - Graphics
  - Install Prep
  - Install/Dismantle
  - Metal
  - Paint
  - Sculpt

#### Service Item

- Field ID: `957306`
- Active and required
- Contains accounting/payroll-oriented labor choices, overtime variants, expense items, and many unrelated QBO service items.
- Tracker currently reads this field as `service_item`.

### Project-specific behavior

The live QBT jobcode for project `26188 — Whatnot — ComicCon` exists, but it currently has:

- no jobcode-specific Build Item filters;
- no jobcode-specific Type of Work filters;
- no required custom-field dependencies.

The QBT API supports custom-field item filters scoped to jobcodes, users, or groups. That gives the pilot two viable approaches.

## Worker-facing options

### Option A — Reusable Item 01–25

Worker selects:

1. Project
2. Service Item/accounting code
3. Build Item number
4. Type of Work, if retained

**Advantages**

- Existing values already configured.
- No continuous creation/archive lifecycle.
- Stable compact composite key: `project + item number`.

**Risks**

- Mobile dropdown shows only a generic number, not the work-package description.
- Workers need a separate project item map.
- Build Item is globally required, including labor that may be project-wide.
- Four selections may be too much if Service Item and Type of Work overlap.

### Option B — Project-specific descriptive QBT values

Example:

`26188 · 01 · Lower Walls`

Create values per active project, restrict them to the QBT jobcode using `customfielditem_jobcode_filters`, then archive/filter them after closeout.

**Advantages**

- Best phone clarity.
- Workers see number and description together.
- Jobcode filters can keep each project list short.
- Canonical identity remains `project + item number` in Tracker.

**Risks**

- Requires automated create/filter/archive reconciliation.
- Produces many historical managed-list values.
- Must prove mobile filtering and archival behavior before adoption.

### Option C — Generic item numbers plus Tracker work-order map

Keep Item 01–25 in QBT. Provide a mobile-friendly Tracker work-order page showing:

- Item number and description;
- drawings;
- planned trades;
- hours allowed/remaining;
- production notes.

**Advantages**

- Lowest QBT configuration burden.
- Strongest future production handoff.

**Risks**

- Workers must move between QBT and Tracker.
- Error risk remains if the item map is not immediately visible during clock-in.

## Recommended pilot

Start with **Option A plus the Option C item map**, while running a non-production mobile spike for Option B.

This follows the call’s preferred reusable-number model without locking Mecca into generic labels if descriptive filtered choices materially reduce selection errors.

### Recommended short worker flow

1. Select project.
2. Select work package.
3. Select accounting Service Item.
4. Select operational Type of Work only if it adds information not recoverable from Service Item.

Do not ask workers to choose two synonymous trade fields.

### Canonical operational choices to test

#### Shop/work-package trades

- Carpentry / Assembly
- CNC
- Paint / Finish
- Metal / Welding
- Graphics
- Electrical
- Sculpt / Specialty
- Pull / Pack / Prep
- Test Fit

#### Separate phases

- Design
- Install
- Dismantle

Retain `Install/Dismantle` only as a legacy mapping. Do not guess whether historical combined records were install or dismantle.

### Project-wide exception

If QBT cannot make Build Item conditional, add one controlled value:

`Project-wide / No Item`

Allow it only for approved design, install, dismantle, or genuine project-wide labor. Flag its use on shop labor as a coding exception.

## HubSpot → Tracker project creation audit

### HubSpot fields currently read

`getDeal()` requests:

- deal name;
- close date;
- due date;
- amount;
- object ID;
- job number;
- closed-won state.

The webhook also retrieves the associated company, quotes, and quote line items.

### Available PM field

HubSpot has a live deal property:

- internal name: `account_manager`
- label: `Project Manager`
- type: enumeration

A live search of 2026 closed-won deals found:

- 161 deals;
- 161 with job numbers;
- 160 with Project Manager populated.

### Root cause

Tracker does not request `account_manager`. HubSpot-created projects are inserted with:

`pm: "TBD"`

A later webhook refresh preserves a non-TBD Tracker PM, but the daily HubSpot quote sync does not backfill PM.

Therefore PMs are **not currently carried from HubSpot into new Tracker projects**. The missing BILL PM is not primarily a short timing delay; Tracker discards an available PM value at project creation.

### Mapping requirements

Map exact HubSpot values to `user_roles`, never by guessed initials.

Known normalization cases include:

- `Nicholas Gonzales` / label `Nick Gonzales` → Tracker `NG`;
- `Rooster` → Caleb McCallum where BILL identity is needed;
- HubSpot and Tracker names may differ because of preferred/legal or changed names.

Potential collision: Tracker currently uses `KM` for Kristina Morland, while HubSpot includes Kenneth Mecca. Never infer `KM` from Kenneth Mecca.

A validated alias/mapping table needs explicit exception handling rather than fuzzy automatic matching.

## Tracker → BILL budget audit

### Current trigger and amount

A BILL budget is created when:

- `bill_budget_uuid` is absent; and
- rounded `budget_travel + budget_props` is greater than zero.

Only Travel and Props feed the BILL-managed amount. Other Tracker categories are intentionally excluded.

### Current code behavior

- The default owner email is Paul.
- The helper supports one owner and the resolved PM member.
- PM members are request-based:
  - zero assigned limit;
  - zero recurring limit;
  - `shareBudgetFunds: false`;
  - role `MEMBER`.
- David, Caleb/Rooster, and Emily are not encoded as a deterministic always-assigned roster in the project-create helper.

### Live evidence

Recent BILL read-back showed inconsistent rosters:

- `26188`, Tracker PM `NG`: only Paul as owner;
- `26187`, Tracker PM `MS`: only Paul as owner;
- `26186`, Tracker PM `VW`: Paul, Vanessa, David, Caleb, and Emily;
- `26128`, Tracker PM `TBD`: only Paul as owner.

The first three budgets were created by the closed-won webhook. The variation demonstrates that later/manual normalization is not a substitute for deterministic creation and reconciliation.

### Confirmed target roster

New and existing project budgets should reconcile to:

- Joe — owner/approver;
- Emily — owner/admin or backup approver;
- David — request-based member;
- Caleb McCallum/Rooster — request-based member;
- assigned PM — request-based member.

BILL company-level admin rights and budget-level `OWNER`/`MEMBER` roles are different concepts. Implementation should set both levels explicitly where supported rather than calling a budget member an admin.

## Recommended deterministic creation sequence

1. Receive closed-won event.
2. Fetch complete HubSpot deal including `account_manager`.
3. Resolve PM through an explicit alias/mapping table.
4. Persist Tracker project, quote snapshot, PM, and budgets.
5. If PM mapping fails, persist a visible exception; do not silently report success.
6. Acquire an idempotent BILL creation claim.
7. Create or update the BILL budget.
8. Reconcile the complete confirmed roster.
9. Read back exact BILL budget membership.
10. Persist reconciliation outcome and any missing-user/mapping exception.
11. Reconcile again when PM, budget amount, or BILL linkage changes.

Do not use a guessed time delay.

## Required implementation slices

### Slice 1 — PM propagation and BILL reconciliation

- Add `account_manager` to HubSpot deal retrieval and types.
- Add explicit full-name/alias → Tracker PM mapping.
- Use resolved PM on project insert instead of `TBD`.
- Preserve valid manual Tracker PM overrides on refresh.
- Encode the confirmed BILL roster.
- Reconcile already-linked budgets when PM or roster changes.
- Add an idempotent creation claim to prevent duplicate BILL budgets.

### Slice 2 — Work-package schema

Add canonical tables/fields for:

- work package;
- item number and description;
- source revision;
- quote status/final approval;
- quoted Item × Trade hours;
- materials/other budget;
- QBT custom-field IDs/names;
- actual hours and coding exceptions.

### Slice 3 — QBT spike

For one non-production or tightly controlled project:

- verify Android/iPhone clock-in order;
- verify Build Item and Type of Work appear in API timesheet payloads;
- verify project-specific filters on mobile;
- verify edits/corrections preserve audit history;
- verify export/report composite identity;
- verify `Project-wide / No Item` exception behavior.

### Slice 4 — Tracker UI

Preserve Budget Handoff columns, then add:

- item number;
- trade/phase;
- quoted hours;
- actual hours;
- variance;
- remaining hours;
- coding completeness;
- source revision;
- status/owner;
- change-order/approval links.

## Acceptance gates

1. A HubSpot deal with a mapped PM creates a Tracker project with the correct PM on the first transaction.
2. A missing/ambiguous PM creates a visible exception and cannot be silently marked reconciled.
3. BILL read-back shows every confirmed roster member and request-mode settings.
4. Duplicate webhook delivery does not create duplicate Tracker projects or BILL budgets.
5. Every pilot labor row resolves to project + work package + accounting Service Item, plus trade where required.
6. Install and dismantle remain distinguishable from quote through actual labor reporting.
7. Resale is never classified as fabrication.
8. Tracker reproduces the Budget Handoff summary and Item × Trade totals from the approved quote revision.
9. Workbook edits/revisions cannot overwrite the immutable final-approved snapshot used by post-mortems and Ada.

## Known pre-existing test failures

The read-only code-flow audit ran the focused HubSpot/BILL suite: 23 passed and 2 pre-existing tests failed:

1. `src/lib/hubspot-quote-parser.test.ts` expected 244 labor hours while implementation returned 95.
2. `tests/bill-budget-pm-mapping-contract.test.mjs` expected an admin-page source string that is no longer present.

These failures were not caused by this documentation work and must be resolved or re-baselined before implementation acceptance.
