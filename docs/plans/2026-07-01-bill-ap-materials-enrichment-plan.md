# BILL AP Materials Enrichment Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Enrich the MDP materials database with BILL AP invoice/bill evidence so operators can see last-paid/last-seen material pricing and approve invoice-backed vendor-price updates without letting BILL overwrite canonical catalog truth automatically.

**Architecture:** Keep the existing materials catalog as the canonical source of truth. Add a separate BILL AP ingestion lane that authenticates with the AP/AR sync-token flow (`devKey` + `sessionId`), pulls vendors and bills, stores raw bill-line-item observations in append-only tables, matches those observations to canonical materials/vendors, and surfaces operator-review suggestions in the materials UI. BILL AP is an evidence layer, not a write-through source of truth.

**Tech Stack:** Next.js App Router, Supabase/Postgres, BILL v3 AP API (`/v3/login`, `/v3/vendors`, `/v3/bills`), node:test contract/runtime tests, existing MDP materials module.

---

## Operator truth

- Paul/Joe want the spreadsheet/app materials catalog to stay the source of truth.
- BILL Spend & Expense card transactions are not the right feed for this job.
- The right enrichment source is BILL **AP** data: vendors, bills, bill line items, invoice numbers/dates, and attached bill documents.
- BILL AP data is valuable because it contains line-level purchasing evidence (`description`, `quantity`, `price`, `amount`) that can supplement canonical material/vendor price rows.
- Operators need:
  - invoice-backed `last paid` and `last seen` signals on material detail pages
  - a way to review unmatched BILL AP observations
  - a deliberate approve/promote flow before canonical current vendor-price rows change
- The integration must not silently overwrite curated material names, aliases, vendor mappings, or current prices.

---

## Auth + env mapping

### Existing / confirmed
The following secrets are confirmed available in 1Password:
- `BILL.com Dev Key`
- `BILL.com - AP/AR Sync Token`
- `BILLCOM_ORG_ID` is already present in local env for the S&E lane and should be reused if it matches the AP org.

### Standardize env vars
Use these env vars for the AP lane:

| Env var | Purpose | Source in 1Password | Notes |
|---|---|---|---|
| `BILLCOM_DEV_KEY` | BILL developer key for AP/AR login | `BILL.com Dev Key` → concealed credential | Required for `POST /v3/login` |
| `BILLCOM_ORG_ID` | BILL organization id | existing local env / 1Password if separately stored | Required for `POST /v3/login` |
| `BILLCOM_APAR_SYNC_USERNAME` | AP/AR sync-token name | `BILL.com - AP/AR Sync Token` → username | Used as BILL login username |
| `BILLCOM_APAR_SYNC_TOKEN` | AP/AR sync-token value | `BILL.com - AP/AR Sync Token` → concealed credential | Used as BILL login password |
| `BILLCOM_BASE_URL` | BILL API base URL | optional | Default to `https://gateway.prod.bill.com/connect` |

### Keep separate from Spend & Expense env
Do **not** reuse these AP vars for the existing S&E lane:
- `BILLCOM_API_TOKEN`
- `BILLCOM_EMAIL`
- `BILLCOM_PASSWORD`

Those remain for the current spend/budget integration only.

### Suggested `.env.local.example` additions
```env
# BILL AP materials-enrichment lane
BILLCOM_DEV_KEY=
BILLCOM_ORG_ID=
BILLCOM_APAR_SYNC_USERNAME=
BILLCOM_APAR_SYNC_TOKEN=
BILLCOM_BASE_URL=https://gateway.prod.bill.com/connect
```

---

## Confirmed upstream payload shape
Using the AP lane (`devKey` + `sessionId`) against production, we already verified:

- `POST /v3/login` succeeds
- `GET /v3/vendors` succeeds
- `GET /v3/bills` succeeds
- `GET /v3/exports` succeeds but currently returns no scheduled export rows

Observed bill payload includes:
- top-level: `id`, `vendorId`, `vendorName`, `dueDate`, `invoice`, `billLineItems`, `paymentStatus`, `approvalStatus`, `createdTime`, `updatedTime`
- invoice: `invoiceNumber`, `invoiceDate`
- bill line item: `id`, `amount`, `quantity`, `price`, `description`, `classifications`

This is sufficient for a first enrichment lane.

---

## Data model rules

### Canonical truth stays in existing tables
- `materials`
- `material_aliases`
- `vendor_aliases`
- `material_vendor_prices`

### New AP observation layer
Add append-only AP evidence tables.

#### `bill_ap_sync_state`
Track last successful sync state.

Suggested fields:
- `id integer primary key default 1`
- `last_bill_updated_time timestamptz null`
- `last_vendor_updated_time timestamptz null`
- `last_sync_started_at timestamptz null`
- `last_sync_completed_at timestamptz null`
- `last_sync_status text null`
- `last_sync_error text null`

#### `bill_ap_vendors`
Local BILL AP vendor mirror.

Suggested fields:
- `id uuid primary key default gen_random_uuid()`
- `bill_vendor_id text not null unique`
- `vendor_name text not null`
- `archived boolean not null default false`
- `raw_payload jsonb not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `material_purchase_observations`
Append-only bill line item evidence.

Suggested fields:
- `id uuid primary key default gen_random_uuid()`
- `source_type text not null check (source_type in ('bill_ap'))`
- `bill_id text not null`
- `bill_line_item_id text not null`
- `bill_vendor_id text null`
- `vendor_id uuid null references vendors(id)`
- `vendor_raw text null`
- `invoice_number text null`
- `invoice_date date null`
- `due_date date null`
- `description_raw text not null`
- `quantity numeric(12,4) null`
- `unit_price numeric(12,4) null`
- `amount numeric(12,2) not null`
- `classification_ref text null`
- `attachment_ref text null`
- `matched_material_id uuid null references materials(id)`
- `match_status text not null check (match_status in ('unmatched','matched','needs_review','ignored')) default 'unmatched'`
- `match_confidence numeric(5,2) null`
- `match_basis text null`
- `observation_date date null`
- `raw_payload jsonb not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:
- unique on `(bill_id, bill_line_item_id)`
- btree on `bill_vendor_id`
- btree on `vendor_id`
- btree on `matched_material_id`
- btree on `invoice_date`
- btree on `match_status`

#### Optional phase-2 table: `material_observation_reviews`
Only add if review actions become rich enough to need a separate audit table. For phase 1, review state can live directly on `material_purchase_observations` plus `material_change_log` entries for promotions.

---

## Product rules

1. BILL AP observations never directly overwrite `materials`.
2. BILL AP observations never directly overwrite `material_vendor_prices.is_current`.
3. A BILL AP line item may:
   - map vendor aliases
   - suggest material aliases
   - create a review suggestion
   - be promoted manually into a vendor-price row
4. Promotions into canonical vendor-price rows must write audit history.
5. Sync reruns must be idempotent on `(bill_id, bill_line_item_id)`.

---

## Implementation slices

### Phase 1 — auth seam + proof-of-life
Deliverable: reusable AP login helper and raw vendor/bill probes.

#### Task 1: Add env placeholders
**Objective:** Document AP env inputs explicitly.

**Files:**
- Modify: `./.env.local.example`

**Step 1: Write failing contract test**
Create `tests/bill-ap-env.contract.test.mjs` asserting `.env.local.example` contains:
- `BILLCOM_DEV_KEY`
- `BILLCOM_APAR_SYNC_USERNAME`
- `BILLCOM_APAR_SYNC_TOKEN`

**Step 2: Run test to verify failure**
Run: `node --test tests/bill-ap-env.contract.test.mjs`
Expected: FAIL

**Step 3: Add env placeholders**
Append:
```env
BILLCOM_DEV_KEY=
BILLCOM_APAR_SYNC_USERNAME=
BILLCOM_APAR_SYNC_TOKEN=
```

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "docs: add bill ap env placeholders"`

#### Task 2: Add AP auth helper
**Objective:** Create a dedicated AP login/session helper separate from S&E token auth.

**Files:**
- Create: `src/lib/billcom-ap.ts`
- Test: `src/lib/billcom-ap.test.ts`

**Step 1: Write failing runtime tests**
Cover:
- missing env returns clear error
- request builder uses `username`, `password`, `organizationId`, `devKey`
- auth headers use `devKey` + `sessionId`

**Step 2: Run test to verify failure**
Run: `node --import tsx --test src/lib/billcom-ap.test.ts`

**Step 3: Implement minimal helper**
Include:
- `getBillApConfig()`
- `loginBillAp()`
- `buildBillApHeaders(sessionId)`
- `fetchBillApJson(path, { sessionId, searchParams })`

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: add bill ap auth helper"`

#### Task 3: Add AP route contract
**Objective:** Lock the existence of a new AP sync route before implementation.

**Files:**
- Create: `src/app/api/billcom/ap-sync/route.contract.test.ts`

**Step 1: Write failing contract test**
Assert route source contains:
- `loginBillAp`
- `/v3/vendors` or `vendors`
- `/v3/bills` or `bills`
- `material_purchase_observations`

**Step 2: Run contract test**
Expected: FAIL

**Step 3: Create route stub**
Only enough structure for contract green.

**Step 4: Re-run contract test**
Expected: PASS

**Step 5: Commit**
`git commit -m "test: scaffold bill ap sync route contract"`

---

### Phase 2 — schema foundation
Deliverable: observation-layer tables + generated schema contract coverage.

#### Task 4: Add migration for AP observation tables
**Objective:** Create DB foundation for vendor mirror + bill line-item observations.

**Files:**
- Create: `supabase/migrations/20260701xxxxxx_bill_ap_material_observations.sql`
- Test: `tests/bill-ap-materials-schema.contract.test.mjs`

**Step 1: Write failing schema contract**
Assert migration contains:
- `create table if not exists bill_ap_sync_state`
- `create table if not exists bill_ap_vendors`
- `create table if not exists material_purchase_observations`
- unique `(bill_id, bill_line_item_id)`
- `match_status` check constraint

**Step 2: Run contract**
`node --test tests/bill-ap-materials-schema.contract.test.mjs`
Expected: FAIL

**Step 3: Write migration**
Include indexes and `updated_at` triggers if the repo pattern already uses them.

**Step 4: Re-run contract**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: add bill ap material observation schema"`

---

### Phase 3 — vendor + bill ingestion
Deliverable: idempotent sync from BILL AP into local observation tables.

#### Task 5: Mirror BILL AP vendors
**Objective:** Upsert vendor records from `/v3/vendors` into `bill_ap_vendors`.

**Files:**
- Modify: `src/app/api/billcom/ap-sync/route.ts`
- Test: `src/lib/billcom-ap.test.ts` or a new route/runtime test

**Step 1: Write failing test**
Assert a vendor payload maps to:
- `bill_vendor_id`
- `vendor_name`
- `archived`
- `raw_payload`

**Step 2: Run test**
Expected: FAIL

**Step 3: Implement vendor mirror helper**
Create helper if needed:
- `upsertBillApVendors(...)`

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: mirror bill ap vendors"`

#### Task 6: Ingest bill line items into observations
**Objective:** Normalize bill line items into append-only `material_purchase_observations` rows.

**Files:**
- Modify: `src/app/api/billcom/ap-sync/route.ts`
- Create: `src/lib/billcom-ap-observations.ts`
- Test: `src/lib/billcom-ap-observations.test.ts`

**Step 1: Write failing tests**
Cover mapping of one bill payload into one or more observation rows:
- `bill_id`
- `bill_line_item_id`
- `vendor_raw`
- `invoice_number`
- `invoice_date`
- `description_raw`
- `quantity`
- `unit_price`
- `amount`
- `raw_payload`

**Step 2: Run test**
Expected: FAIL

**Step 3: Implement mapper**
- `buildMaterialPurchaseObservationsFromBill(bill)`
- `upsert` on `(bill_id, bill_line_item_id)`

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: ingest bill ap line item observations"`

#### Task 7: Persist sync state
**Objective:** Track incremental sync cursors/timestamps cleanly.

**Files:**
- Modify: `src/app/api/billcom/ap-sync/route.ts`
- Test: route/runtime test

**Step 1: Write failing test**
Assert sync state updates after a successful vendor/bill pass.

**Step 2: Run test**
Expected: FAIL

**Step 3: Implement state writes**
Track:
- last started/completed
- status
- error
- latest bill/vendor update timestamps if the API supports them robustly

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: persist bill ap sync state"`

---

### Phase 4 — matching + review classification
Deliverable: vendor normalization + initial material matching.

#### Task 8: Normalize AP vendors into canonical vendors
**Objective:** Map BILL AP vendor records onto `vendors` / `vendor_aliases`.

**Files:**
- Create: `src/lib/materials/bill-ap-match.ts`
- Test: `src/lib/materials/bill-ap-match.test.ts`

**Step 1: Write failing tests**
Cover:
- exact vendor name match
- vendor alias match
- unmatched vendor leaves `vendor_id = null`

**Step 2: Run test**
Expected: FAIL

**Step 3: Implement minimal vendor matcher**
Do not auto-create aliases yet unless exact confidence is high.

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: match bill ap vendors to canonical vendors"`

#### Task 9: Add first-pass material matching
**Objective:** Match bill line descriptions against materials/aliases conservatively.

**Files:**
- Modify: `src/lib/materials/bill-ap-match.ts`
- Test: `src/lib/materials/bill-ap-match.test.ts`

**Step 1: Write failing tests**
Cover:
- exact alias match → `matched`
- weak match → `needs_review`
- no match → `unmatched`

**Step 2: Run test**
Expected: FAIL

**Step 3: Implement conservative matcher**
Use:
- normalized description text
- vendor context when available
- alias-first matching

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: classify bill ap material observations"`

---

### Phase 5 — operator-facing read surface
Deliverable: visible AP enrichment inside materials UI.

#### Task 10: Expose observation summary in material detail API
**Objective:** Return recent AP observations for a material.

**Files:**
- Modify: `src/app/api/materials/[id]/route.ts`
- Test: `src/app/api/materials/materials-phase5.contract.test.ts` or new contract test

**Step 1: Write failing contract test**
Assert detail route loads:
- `material_purchase_observations`
- recent matched observations
- summary fields for `last_paid`, `last_seen_vendor`, `last_invoice_date`

**Step 2: Run test**
Expected: FAIL

**Step 3: Implement API response extension**
Return:
- recent observations list
- computed summary

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: expose bill ap observation summary on material detail"`

#### Task 11: Render AP evidence on material detail page
**Objective:** Show invoice-backed purchasing evidence without changing canonical rows.

**Files:**
- Modify: `src/app/admin/materials/[id]/page.tsx`
- Test: new contract test `src/app/admin/materials/material-detail-bill-ap.contract.test.ts`

**Step 1: Write failing contract test**
Assert page source includes:
- `Last paid`
- `Last seen`
- AP observation list or card section
- invoice/vendor/date references

**Step 2: Run test**
Expected: FAIL

**Step 3: Implement UI**
Add a compact card:
- last paid amount
- last seen vendor
- last invoice date
- recent observation rows

**Step 4: Re-run test**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: show bill ap evidence on material detail page"`

---

### Phase 6 — review/promotion workflow
Deliverable: operator-approved promotion from AP observation to canonical vendor-price row.

#### Task 12: Add promote-to-vendor-price action
**Objective:** Let an operator promote a matched AP observation into a canonical vendor-price update.

**Files:**
- Create: `src/app/api/materials/observations/[id]/promote/route.ts`
- Test: contract test + runtime test

**Step 1: Write failing tests**
Assert route:
- loads observation
- writes/updates `material_vendor_prices`
- retires superseded current row when appropriate
- logs `material_change_log`
- marks observation reviewed/promoted

**Step 2: Run tests**
Expected: FAIL

**Step 3: Implement minimal route**
Require admin auth.

**Step 4: Re-run tests**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: promote bill ap observation to vendor price"`

#### Task 13: Add unmatched/review queue page
**Objective:** Give operators a place to resolve AP observations not confidently matched.

**Files:**
- Create: `src/app/admin/materials/observations/page.tsx`
- Create: `src/app/api/materials/observations/route.ts`
- Test: contract tests

**Step 1: Write failing contract tests**
Assert route/page supports:
- `match_status` filters
- list of unmatched/needs_review rows
- actions to ignore or relink

**Step 2: Run tests**
Expected: FAIL

**Step 3: Implement page + route**
Keep phase 1 simple: list, filters, relink, ignore.

**Step 4: Re-run tests**
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: add bill ap materials observation review queue"`

---

## Verification commands

### Focused tests
```bash
node --test tests/bill-ap-env.contract.test.mjs
node --test tests/bill-ap-materials-schema.contract.test.mjs
node --import tsx --test src/lib/billcom-ap.test.ts
node --import tsx --test src/lib/billcom-ap-observations.test.ts
node --import tsx --test src/lib/materials/bill-ap-match.test.ts
node --import tsx --test src/app/api/materials/import/*.test.ts src/app/api/materials/*.test.ts
```

### Build
```bash
npm run build
```

### Live AP proof after auth wiring
Use a one-off script or route to verify:
1. login via `POST /v3/login`
2. pull 3 vendors
3. pull 3 bills
4. confirm at least one bill has line items with `description`, `amount`, and optional `quantity` / `price`

### Product verification
After shipping the first UI slice:
- open `/admin/materials/[id]` for a material likely to appear on AP bills
- verify `Last paid` / `Last seen` values render
- verify no canonical current vendor-price row changed without an explicit promote action

---

## Risks / caveats

1. **Bill polling shape may not support robust incremental cursors the same way S&E does.** If so, fallback to conservative full recent-window polling plus idempotent upsert.
2. **Line-item descriptions may be noisy.** Match conservatively; bias toward `needs_review` rather than false-positive linking.
3. **Some invoices may be PDF-heavy and line-item-light.** That is fine for phase 1; document/attachment parsing can come later.
4. **Do not merge on price alone.** Description/vendor context matter.
5. **Do not auto-promote.** AP observations are evidence, not truth.

---

## 72-hour cut line
If speed matters, ship only this first:
1. AP auth helper
2. schema
3. vendor mirror
4. bill line-item observations
5. material detail `last paid / last seen` card

Defer the full review queue and promotion workflow until after operators confirm the AP signal quality is worth it.
