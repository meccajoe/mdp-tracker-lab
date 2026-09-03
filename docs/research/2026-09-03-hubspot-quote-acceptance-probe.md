# HubSpot quote acceptance and QBT payload probe

**Captured:** 2026-09-03 10:09 CDT  
**Mode:** Read-only. No HubSpot quote, QBT custom field, time entry, or production record was created or changed.

## Purpose

Release 0 verifies the external contracts needed by later Quote-to-Production releases before any publication, acceptance ingestion, Workforce configuration, or operational-release path is enabled.

The sanitized replay fixtures are:

- `tests/fixtures/hubspot-quote-publication/quote-status-contract.json`
- `tests/fixtures/hubspot-quote-publication/published-readback-contract.json`
- `tests/fixtures/qbt-work-package-pilot/custom-field-contract.json`

Identifiers tied to people, customers, deals, quotes, projects, and time entries are replaced with `[REDACTED]`. Credentials and authorization headers are not persisted.

## HubSpot findings

### Publication read-back is proven

A read-only search found 487 quote records currently reporting `hs_quote_status = PUBLISHED`. A recent published quote read back with:

- one associated deal;
- nine associated line items;
- quote status `PUBLISHED`;
- internal approval status `APPROVAL_NOT_NEEDED`.

This confirms that `hs_status` is not evidence of customer publication. The publication gate must use `hs_quote_status`, require the exact deal association, preserve line order, and compare the read-back to Tracker's immutable publication manifest.

The fixture intentionally preserves only response shape, status values, association counts, and value types. Customer text, amounts, timestamps, and external record IDs are redacted.

### Acceptance is structurally identified but not fully proven

The live quote property definition exposes these `hs_quote_status` values:

- `DRAFT`
- `PENDING_APPROVAL`
- `CHANGES_REQUESTED`
- `PUBLISHED`
- `PUBLISHING`
- `ACCEPTED`
- `EXPIRED`
- `VOID`
- `ARCHIVED`

Read-only account searches observed:

- current `ACCEPTED` quotes: 0;
- quotes with `hs_accepted_date`: 0;
- quotes with `hs_acceptance_method`: 0;
- quotes with `hs_esign_date`: 211;
- quotes with `hs_manually_signed`: 3.

A signed historical sample currently reported:

- `hs_quote_status = EXPIRED`;
- `hs_sign_status = ESIGN_COMPLETED`;
- `hs_quote_esign_status = SIGNED`;
- an `hs_esign_date` value.

Its property history did not expose a prior `ACCEPTED` transition. Therefore:

1. `hs_quote_status = ACCEPTED` is a real account enum value and remains the strongest direct acceptance status.
2. Signature fields are real evidence but cannot be collapsed into the current quote status or treated as proof of a historically observed `ACCEPTED` transition.
3. Automatic customer-acceptance ingestion remains disabled until a controlled lifecycle pilot captures the exact webhook or polling transition and verifies it against an exact Tracker publication.
4. A manual acceptance, if later permitted, must remain `manual_verified`, require evidence and an authorized actor, and must not masquerade as a HubSpot event.

## QBT / QuickBooks Time findings

### Live custom-field contract

| Field ID | Live label | Required | Visible to all | Active choices |
|---|---|---:|---:|---:|
| `2883322` | Build Item | Yes | Yes | 25 |
| `957306` | Service Item | Yes | Yes | 94 total choices returned; active and inactive states preserved in the fixture |
| `2883364` | Type of Work | No | No | 7 |

The existing Build Item choices are `Item 01` through `Item 25`. This is a current integration constraint, not Tracker's permanent identity model.

The current Type of Work choices include a combined `Install/Dismantle` value. That does not satisfy the approved Tracker model, where install and dismantle remain separate. No live choice was changed.

### Labor payload identity correction

A real read-only timesheet payload contained `customfields` keyed by the immutable field IDs, but the values were labels or empty strings:

```text
2883322 -> ""
957306  -> "FAB LABOR"
2883364 -> ""
```

The timesheet payload did **not** return custom-field item IDs in these values. Release 6 must therefore use a versioned custom-field-item snapshot to resolve each observed label to the corresponding item identity. It must not parse labels into Tracker work-package identity or assume that QBT returns item IDs on the time entry.

The sample also proves that historical rows can contain an empty Build Item value even though the field is currently required. Missing or unmapped values must remain unresolved and visible for correction; they cannot be guessed.

### Correction lineage

The current `/timesheets` response exposes `id`, `last_modified`, the current coding values, duration, and state. The read-only `/timesheets_deleted` endpoint is also available and exposes deletion snapshots. Neither response reconstructs prior values for an edited time entry.

Tracker must therefore:

- version imports by source timesheet ID and source `last_modified`;
- append a correction event when a later version changes canonical coding or duration;
- preserve the original imported snapshot;
- ingest deletion observations as append-only source evidence;
- never overwrite the only copy of prior labor coding.

## Release 0 status and gate

Proven:

- published quote status and read-back relationship shape;
- exact HubSpot status property and enum values;
- QBT field identities, labels, visibility, required flags, and choices;
- QBT labor payload field-key/value shape;
- QBT current and deleted timesheet response capabilities;
- sanitized deterministic fixtures with no credentials.

Still required before enabling the affected later release:

- a controlled HubSpot quote lifecycle pilot that captures a real acceptance transition or explicitly approved manual-evidence path;
- HubSpot create/associate/read-back testing for a non-customer or explicitly approved test quote in Release 4;
- a controlled QBT mobile pilot proving selection persistence, same-job switching, corrections, export/read-back, and separate install/dismantle semantics.
