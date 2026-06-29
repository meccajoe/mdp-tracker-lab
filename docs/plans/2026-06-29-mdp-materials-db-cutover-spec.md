# MDP Materials DB Cutover Spec

> **For Hermes:** This is a product/spec document first, not an implementation start. Use it to drive a later TDD implementation plan.

**Goal:** Replace the current Google Sheets materials workbook with an internal web materials database that becomes Mecca Design's new source of truth for catalog/search/editing, while preserving room for later invoice-email and BILL AP enrichment.

**Recommended home:** Build this inside `~/projects/mdp-tracker` as an admin-only module rather than as a standalone app for v1.

**Architecture:** Reuse MDP Tracker's existing auth, sidebar, admin routing, Supabase/Postgres backend, vendor-management surface, and search/API patterns. Import the current 5-tab workbook into staging tables first, normalize per-tab into a canonical materials catalog, and expose an admin-only CRUD/search/import experience. Keep catalog truth separate from transaction truth so invoice/BILL data can enrich the catalog later without corrupting canonical material rows.

**Tech Stack:** Next.js App Router, Supabase/Postgres, existing MDP Tracker auth and admin shell, `xlsx` package already present in `package.json`, `node:test` contract tests plus focused runtime/unit tests.

---

## Recommendation: build this inside MDP Tracker

### Why this is the fastest good path
1. **Auth already exists**
   - MDP Tracker already uses Google OAuth restricted to `@meccadesign.com`.
   - No need to build a second admin auth surface.

2. **Admin IA already exists**
   - Sidebar and admin sections already exist in `src/components/Sidebar.tsx`.
   - There is already a settings/purchasing mental model inside the app.

3. **Vendor management already exists**
   - `/admin/vendors` already manages `vendors` and purchasers.
   - We can extend that purchasing/admin area instead of inventing parallel vendor records elsewhere.

4. **Search patterns already exist**
   - `/line-item-search` + `/api/line-items/search` already give us a concrete search/UI/API pattern to copy.

5. **Supabase-backed internal tooling already exists**
   - This is exactly the kind of internal admin surface MDP Tracker already is.

### Product decision
For v1, treat this as a **new admin module inside MDP Tracker**, not a separate greenfield app.

Recommended route family:
- `/admin/materials`
- `/admin/materials/import`
- `/admin/materials/[id]` *(optional in phase 2 if list + drawer/modal is enough for v1)*

---

## Source workbook intake

Google Sheet inspected directly on 2026-06-29 after link-view access was enabled.

### Tabs
1. `MATERIAL DATA BASE`
2. `Wood`
3. `MetalAluminum`
4. `Graphics`
5. `Packaging Material`

### What the workbook actually is
This workbook is **not one normalized table**. It is a mix of:
- a summary/search sheet
- raw category/vendor price sheets
- grouped/hierarchical sections
- repeated headers
- side-by-side parallel lists
- spreadsheet data corruption from fraction/date auto-formatting

### Direct workbook findings

#### 1) `MATERIAL DATA BASE`
- approx. **288 non-empty rows**
- approx. **7 used columns**
- row 1 contains stray junk (`e`)
- row 2 acts like the header row:
  - `Material`
  - `Code/size`
  - `Format`
  - `Price`
  - `Link`
- category rows like `Pine` / `Plywood` are mixed into the same column as item rows
- this is best treated as a **summary/catalog-ish sheet**, not the authoritative raw source

#### 2) `Wood`
- approx. **260 non-empty rows**
- approx. **13 used columns**
- core columns appear to be:
  - `B` vendor
  - `C` material
  - `D` dimensions
  - `E` thickness
  - `F` price
  - `J:M` occasional extra notes/related info
- **critical data corruption exists**:
  - `1/2` became `2023-01-02`
  - `3/4` became `2023-03-04`
- this tab must be cleaned by parser rules before any canonical import

#### 3) `MetalAluminum`
- approx. **113 non-empty rows**
- repeated header blocks appear within the sheet
- unit/length information sometimes spills into an adjacent optional column
- vendor is in column `B`, material in `C`, dimension in `D`, price in `E`, optional unit text sometimes in `F`

#### 4) `Graphics`
- approx. **19 non-empty rows**
- stores **two side-by-side vendor/material/price lists on the same row block**:
  - left list in `A:C`
  - right list in `E:G`
- this must be exploded into one row per material/vendor/price record

#### 5) `Packaging Material`
- approx. **87 non-empty rows**
- grouped structure:
  - one material name row
  - several vendor rows beneath it with the material cell left blank
- requires downward inheritance of the most recent non-empty material group name

### Non-negotiable import rule
**Do not import this workbook directly into the production materials table.**

First:
1. land it into staging parsers per tab
2. repair sheet-specific structure
3. surface ambiguous rows for review where needed
4. only then upsert into normalized catalog tables

---

## Operator truth

### Primary users
- **Paul / purchasing-estimating operators**
  - need fast search for current material pricing and options
  - want this app to replace the spreadsheet as the real maintained source
- **Admin users**
  - need import/cutover controls
  - need vendor cleanup, alias mapping, and auditing
- **Later automation layers**
  - invoice email ingestion
  - BILL AP reconciliation
  - Ada pricing/search integration

### What the spreadsheet does today
- stores current material references and prices imperfectly
- acts as the shared lookup surface
- mixes raw vendor pricing with semi-curated summary records
- relies on humans remembering context the sheet does not encode well

### What the new system must do
- become the **canonical catalog source of truth**
- support edits in the app instead of the sheet
- preserve provenance/history
- allow vendor-specific pricing without duplicating whole materials unnecessarily
- support search that is better than the sheet

### Product implication
This is **not** just “sheet search.”
It is a **catalog cutover**.

That means v1 must include:
- import
- normalization
- search
- create/edit/archive
- audit/change history
- vendor-aware pricing rows

---

## Domain model: keep catalog truth separate from transaction truth

### Core rule
A **material** is not the same thing as an **observed invoice/BILL transaction**.

Examples:
- the same material may appear under different vendor wording
- the same vendor may sell the same thing in multiple pack sizes
- invoice description text may be noisy, abbreviated, or inconsistent
- BILL AP may show posting-month truth, not operational/material-catalog truth

### Therefore
The canonical catalog should remain stable, while invoice/BILL rows later become enrichment/reconciliation inputs.

---

## Recommended canonical schema

### Reuse existing table where possible
Keep the existing `vendors` table as the canonical vendor table:
- current file: `supabase/migrations/003_vendors_purchasers.sql`
- current admin UI: `src/app/admin/vendors/page.tsx`

Extend around it instead of creating a duplicate top-level vendor table.

### New tables

#### 1) `materials`
One row per canonical material.

Suggested fields:
- `id uuid primary key default gen_random_uuid()`
- `canonical_name text not null`
- `category text not null`
- `subcategory text null`
- `dimensions text null`
- `thickness_text text null`
- `base_unit text null`
- `default_vendor_id uuid null references vendors(id)`
- `default_price numeric(12,2) null`
- `sku_or_code text null`
- `finish text null`
- `notes text null`
- `search_text text generated/stored or maintained text`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by text null`
- `updated_by text null`

Recommended indexes:
- `gin(to_tsvector('english', search_text))`
- btree on `category`
- btree on `active`
- optional composite on `(category, canonical_name)`

#### 2) `vendor_aliases`
Map messy source/vendor spellings to canonical vendor records.

Suggested fields:
- `id uuid pk`
- `vendor_id uuid not null references vendors(id) on delete cascade`
- `alias_text text not null`
- `normalized_alias_text text not null`
- `source_type text null check (source_type in ('spreadsheet','invoice','bill','manual'))`
- `created_at timestamptz default now()`

Unique index:
- `unique(normalized_alias_text)`

#### 3) `material_aliases`
Search-friendly synonyms and alternate phrasings for the same material.

Suggested fields:
- `id uuid pk`
- `material_id uuid not null references materials(id) on delete cascade`
- `alias_text text not null`
- `normalized_alias_text text not null`
- `created_at timestamptz default now()`

Unique index:
- `unique(material_id, normalized_alias_text)`

#### 4) `material_vendor_prices`
Vendor-specific pricing rows for a canonical material.

Suggested fields:
- `id uuid pk`
- `material_id uuid not null references materials(id) on delete cascade`
- `vendor_id uuid null references vendors(id)`
- `vendor_sku text null`
- `vendor_material_name text null`
- `vendor_dimension_text text null`
- `unit text null`
- `pack_quantity numeric(12,4) null`
- `price numeric(12,2) not null`
- `price_basis text null` *(each, sheet, roll, case, ft, sq ft, etc.)*
- `effective_date date null`
- `source_type text not null check (source_type in ('spreadsheet','invoice','bill','manual'))`
- `source_ref text null`
- `is_current boolean not null default true`
- `notes text null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Recommended indexes:
- `(material_id, is_current)`
- `(vendor_id, is_current)`
- `(source_type)`

#### 5) `material_import_batches`
Track every workbook import/cutover run.

Suggested fields:
- `id uuid pk`
- `source_name text not null`
- `source_url text null`
- `uploaded_by text null`
- `status text not null check (status in ('preview','committed','failed'))`
- `workbook_hash text null`
- `summary jsonb not null default '{}'`
- `created_at timestamptz default now()`

#### 6) `material_import_rows`
Raw/staged rows extracted from the workbook before normalization.

Suggested fields:
- `id uuid pk`
- `batch_id uuid not null references material_import_batches(id) on delete cascade`
- `sheet_name text not null`
- `source_row_number integer not null`
- `raw_row jsonb not null`
- `parsed_row jsonb null`
- `normalized_candidate jsonb null`
- `status text not null check (status in ('parsed','needs_review','skipped','imported','error'))`
- `error_text text null`
- `created_at timestamptz default now()`

#### 7) `material_change_log`
Audit trail for all meaningful canonical edits.

Suggested fields:
- `id uuid pk`
- `material_id uuid null references materials(id) on delete set null`
- `entity_type text not null` *(material, material_vendor_price, vendor_alias, material_alias)*
- `entity_id uuid not null`
- `change_type text not null` *(create, update, archive, unarchive, import_commit)*
- `field_name text null`
- `old_value jsonb null`
- `new_value jsonb null`
- `changed_by text null`
- `changed_at timestamptz not null default now()`
- `batch_id uuid null references material_import_batches(id) on delete set null`

### Deliberately not in v1 canonical table
Do **not** bake these into `materials` as first-class fields yet:
- last invoice price
- last BILL AP price
- last invoice date
- suggested vendor match confidence
- OCR blobs / PDF text

Those belong in later transaction/enrichment tables, not in the primary catalog row.

---

## Normalization rules per tab

### Shared normalization helpers
Create one shared helper layer for:
- trim/collapse whitespace
- normalize quotes/apostrophes
- uppercase/lowercase normalization for search keys
- parse currency safely
- infer unit strings
- preserve original text while computing normalized match keys
- detect obviously bad date-coerced fractions

### 1) `MATERIAL DATA BASE`
Treat as a semi-curated summary sheet.

Rules:
- ignore row 1 stray `e`
- row 2 is header row
- if column A has a value and columns B:D are empty, treat row as a **category heading**
- carry that category forward to subsequent item rows until next heading
- map columns:
  - A = material name
  - B = code/size
  - C = format/unit
  - D = price
  - E = link
- skip rows with no usable item name and no price
- use this tab as a **high-confidence seed for canonical names/category labels**, not necessarily for all vendor detail richness

### 2) `Wood`
Treat as raw vendor-pricing source.

Rules:
- columns:
  - B = vendor
  - C = material name
  - D = dimensions
  - E = thickness
  - F = price
  - J:M = occasional notes/related info
- repair date-coerced fractions in column E:
  - `2023-01-02` => `1/2`
  - `2023-03-04` => `3/4`
  - only do this in the known thickness column and only for known spreadsheet-fraction corruption patterns
- preserve unrecognized date-like values for manual review rather than guessing
- combine J:M into a normalized notes blob only when non-empty
- vendor matching should go through `vendors` + `vendor_aliases`, not direct text trust

### 3) `MetalAluminum`
Treat as repeated vendor blocks.

Rules:
- detect repeated header rows (`Material`, `Dimension`, `Price`) and skip them
- columns:
  - B = vendor
  - C = material name
  - D = dimension text
  - E = price
  - F = optional unit/length/basis
- inherit vendor by row only; do not carry across blank vendor rows unless confirmed in real data
- store dimension text raw first; parse structured dimensions later if needed

### 4) `Graphics`
Treat as two simultaneous vertical lists.

Rules:
- explode each physical row into up to two logical records:
  - left record from `A:B:C`
  - right record from `E:F:G`
- ignore empty triplets
- do not assume left/right pair relationship beyond shared physical row position
- category for all imported rows defaults to `Graphics` unless a subcategory rule is added later

### 5) `Packaging Material`
Treat as grouped material families with inherited material names.

Rules:
- columns:
  - B = material group/name
  - C = vendor
  - D = dimension
  - E = rolls per case / pack quantity
  - F = price per roll
- when B is non-empty, set the active group/material context
- when B is blank but vendor/price fields exist, inherit the most recent active material group
- store pack quantity and price basis explicitly so later search can answer both per-roll and per-case questions cleanly

---

## Catalog merge/upsert rules

### Matching strategy
Do **not** trust a naive exact-name-only import.

Use a staged merge strategy:
1. exact canonical match on normalized material name + category + dimensions when available
2. alias match through `material_aliases`
3. if ambiguous, mark `needs_review`
4. if unmatched, create a new canonical material candidate

### Import policy
For v1 import commit:
- create canonical materials from the cleanest available row when unmatched
- append vendor price rows separately rather than overwriting the canonical record repeatedly
- only set `default_vendor_id` / `default_price` when the source is high-confidence or user-approved

### Important safety rule
Spreadsheet import should never silently merge two records just because prices match.

---

## Web app v1 scope

## 1) Materials list/search page
Recommended route:
- `src/app/admin/materials/page.tsx`

Purpose:
- become the day-to-day searchable materials home
- replace "open the sheet and hunt around"

Required capabilities:
- keyword search
- filters:
  - category
  - vendor
  - active/inactive
  - has current price
- sort by:
  - material name
  - category
  - vendor
  - current/default price
  - updated at
- compact result row showing:
  - canonical name
  - category
  - dimensions/thickness summary
  - default vendor
  - current/default price
  - active status
- open detail/edit drawer or detail page

### UX note
Borrow the successful feel of `/line-item-search`:
- big search bar first
- filters nearby
- dense but readable table
- export optional later, not required for v1 cutover

## 2) Material detail/edit surface
Recommended route(s):
- inline drawer/modal from list for v1, or
- `src/app/admin/materials/[id]/page.tsx` if detail-page pattern is preferred

Required capabilities:
- edit canonical fields
- view and manage vendor-specific price rows
- add material aliases
- archive/unarchive material
- show recent change history

## 3) Import preview/commit page
Recommended route:
- `src/app/admin/materials/import/page.tsx`

Required capabilities:
- upload workbook or use saved source file
- run preview parse
- show counts by sheet/status
- show `needs_review` rows
- allow commit once preview is acceptable
- log import batch metadata

### Important product behavior
This page is for admins only.
Normal operators should live on `/admin/materials`, not inside import machinery.

---

## API surface

Recommended server routes:

### Search/read
- `src/app/api/materials/search/route.ts`
- `src/app/api/materials/[id]/route.ts`

### CRUD
- `src/app/api/materials/route.ts` *(create)*
- `src/app/api/materials/[id]/route.ts` *(update/archive via PATCH)*
- `src/app/api/materials/[id]/prices/route.ts`
- `src/app/api/materials/[id]/aliases/route.ts`

### Import
- `src/app/api/materials/import/preview/route.ts`
- `src/app/api/materials/import/commit/route.ts`

### Why API routes instead of pure client-table writes
Even though some existing admin pages write directly with browser Supabase auth, this feature should go through server routes because it needs:
- normalization
- audit logging
- batch import orchestration
- deterministic side effects
- later invoice/BILL reconciliation hooks

---

## Existing files to reuse or mirror

### Reuse for IA / nav / page style
- `src/components/Sidebar.tsx`
- `src/app/admin/vendors/page.tsx`
- `src/app/line-item-search/LineItemSearchClient.tsx`
- `src/app/api/line-items/search/route.ts`

### Reuse for migration/testing style
- `supabase/migrations/003_vendors_purchasers.sql`
- `supabase/migrations/20260526000000_quote_line_items.sql`
- `src/app/api/line-items/search/route.contract.test.ts`
- `scripts/import-csv.ts`

---

## Exact files recommended for the first serious implementation

### Database / migrations
- `supabase/migrations/20260629xxxxxx_materials_catalog.sql`

### Import / normalization library
- `src/lib/materials/types.ts`
- `src/lib/materials/normalize.ts`
- `src/lib/materials/workbook.ts`
- `src/lib/materials/match.ts`
- `src/lib/materials/search.ts`
- `src/lib/materials/audit.ts`

### Import script / utility
- `scripts/import-materials-workbook.ts`

### API routes
- `src/app/api/materials/search/route.ts`
- `src/app/api/materials/route.ts`
- `src/app/api/materials/[id]/route.ts`
- `src/app/api/materials/import/preview/route.ts`
- `src/app/api/materials/import/commit/route.ts`

### UI routes/components
- `src/app/admin/materials/page.tsx`
- `src/app/admin/materials/MaterialsClient.tsx`
- `src/app/admin/materials/import/page.tsx`
- `src/app/admin/materials/import/MaterialsImportClient.tsx`
- `src/components/materials/MaterialForm.tsx`
- `src/components/materials/MaterialPriceTable.tsx`
- `src/components/materials/MaterialImportPreview.tsx`

### Tests
- `src/lib/materials/normalize.test.ts`
- `src/lib/materials/match.test.ts`
- `src/app/api/materials/search/route.contract.test.ts`
- `src/app/api/materials/import/preview/route.contract.test.ts`
- `src/app/admin/materials/MaterialsClient.contract.test.ts`
- `tests/materials-schema.contract.test.mjs`

---

## TDD implementation sequence

# Phase 1 — Schema foundation and import staging

### Task 1: Write schema contract test
**Objective:** lock the required tables before writing the migration.

**Files:**
- Create: `tests/materials-schema.contract.test.mjs`
- Modify later: `supabase/migrations/20260629xxxxxx_materials_catalog.sql`

**RED assertions should include:**
- `CREATE TABLE ... materials`
- `CREATE TABLE ... material_vendor_prices`
- `CREATE TABLE ... material_import_batches`
- `CREATE TABLE ... material_import_rows`
- `CREATE TABLE ... material_change_log`
- `CREATE TABLE ... vendor_aliases`
- `CREATE TABLE ... material_aliases`

**Run:**
- `node --test tests/materials-schema.contract.test.mjs`

### Task 2: Add migration
Implement only enough migration SQL to make the schema contract pass.

### Task 3: Add normalization helper tests
**Objective:** lock parsing/repair behavior for the messy workbook.

**Files:**
- Create: `src/lib/materials/normalize.test.ts`
- Create: `src/lib/materials/normalize.ts`

**Must cover:**
- category carry-forward from `MATERIAL DATA BASE`
- wood thickness date repair (`2023-01-02` -> `1/2`, `2023-03-04` -> `3/4`)
- repeated header skipping in `MetalAluminum`
- left/right list split in `Graphics`
- downward material-group inheritance in `Packaging Material`

### Task 4: Add workbook parser
**Files:**
- Create: `src/lib/materials/workbook.ts`
- Optional helper: `src/lib/materials/types.ts`

**Behavior:**
- read workbook with `xlsx`
- emit raw staged rows per sheet
- pass them through normalization helpers

---

# Phase 2 — Search/read API

### Task 5: Write search route contract test
**Objective:** lock server search behavior before implementation.

**Files:**
- Create: `src/app/api/materials/search/route.contract.test.ts`
- Create later: `src/app/api/materials/search/route.ts`

**Assertions should include:**
- route queries `materials`
- joins/loads current vendor/price context
- supports search term
- supports category/vendor/active filters
- supports safe sort allowlist

### Task 6: Implement search route
Copy the successful defensive pattern from `src/app/api/line-items/search/route.ts`.

---

# Phase 3 — Materials list UI

### Task 7: Write source-level UI contract test
**Objective:** lock the page shape before implementation.

**Files:**
- Create: `src/app/admin/materials/MaterialsClient.contract.test.ts`
- Create later: `src/app/admin/materials/page.tsx`
- Create later: `src/app/admin/materials/MaterialsClient.tsx`

**Assertions should include:**
- page renders `Materials`
- uses `/api/materials/search`
- includes search input
- includes category/vendor filters
- includes active/inactive filter
- includes add/import actions

### Task 8: Add sidebar link
**Files:**
- Modify: `src/components/Sidebar.tsx`

Recommended placement:
- under `Settings` as `Materials`, or
- under a dedicated `Purchasing` subsection if that section grows

**Recommendation:** put `Materials` under `Settings` near `Purchasing` for v1.

### Task 9: Implement list page/client
Borrow interaction and density patterns from `LineItemSearchClient.tsx`, but tailor result columns for catalog lookup rather than transactions.

---

# Phase 4 — CRUD and audit logging

### Task 10: Write material create/update runtime tests
**Files:**
- Create: `src/lib/materials/match.test.ts`
- Create: `src/lib/materials/audit.ts`
- Create: `src/app/api/materials/route.ts`
- Create: `src/app/api/materials/[id]/route.ts`

**Cover:**
- create material
- update material
- archive/unarchive material
- write corresponding `material_change_log` row

### Task 11: Add material edit UI
**Files:**
- Create: `src/components/materials/MaterialForm.tsx`
- Create: `src/components/materials/MaterialPriceTable.tsx`

**Behavior:**
- create/edit canonical material
- manage vendor-specific price rows
- manage aliases in a simple v1 surface

---

# Phase 5 — Import preview and commit

### Task 12: Write import preview contract test
**Files:**
- Create: `src/app/api/materials/import/preview/route.contract.test.ts`
- Create later: `src/app/api/materials/import/preview/route.ts`

**Assertions should include:**
- route uses workbook parser helpers
- route writes/returns import batch shape or preview summary
- route returns counts by sheet/status
- route can surface `needs_review` rows

### Task 13: Implement preview route
Preview should:
- parse workbook
- create `material_import_batches` + `material_import_rows` preview records
- return summary JSON without touching canonical catalog yet

### Task 14: Implement commit route
Commit should:
- resolve clean matches
- create/update canonical materials and vendor price rows
- write audit log rows
- mark import rows/batch committed

### Task 15: Build import admin screen
**Files:**
- `src/app/admin/materials/import/page.tsx`
- `src/app/admin/materials/import/MaterialsImportClient.tsx`
- `src/components/materials/MaterialImportPreview.tsx`

---

# Phase 6 — Cutover hardening

### Task 16: Add “source of truth” operator affordances
Not cosmetic — this is part of the cutover.

Add:
- `Last updated`
- `Updated by`
- visible price provenance on vendor rows (`manual`, `spreadsheet import`, later `invoice`, later `bill`)
- archive instead of delete

### Task 17: Define cutover checklist
Before Paul's team stops editing the sheet:
- workbook imported successfully
- search returns expected known materials
- core editing workflow works
- vendor price edits persist
- audit log visible for sample edits
- 5-10 high-value material lookups spot-checked with Paul
- sheet is declared read-only / retired operationally

---

## Later phases (not v1)

### Phase 7 — invoice email enrichment
Add transaction-side tables / ingestion that can:
- extract vendor/material/price signals from invoice emails/PDFs
- propose vendor aliases
- suggest price updates
- record `last_seen_invoice_price`

### Phase 8 — BILL AP reconciliation
Add transaction-side ingest that can:
- capture actual paid rows
- compare posted price vs canonical/current catalog price
- surface variances

### Critical rule for both later phases
External observed data should create:
- suggestions
- price history
- reconciliation insights

It should **not** silently overwrite canonical catalog values.

---

## Recommended verification commands

### Focused contract tests
- `node --test tests/materials-schema.contract.test.mjs`
- `node --test src/app/api/materials/search/route.contract.test.ts`
- `node --test src/app/api/materials/import/preview/route.contract.test.ts`

### Runtime/unit tests
- `npm test -- src/lib/materials/normalize.test.ts src/lib/materials/match.test.ts`

### Broader verification
- `npm run build`

If a local browser verification pass is done later:
- verify `/admin/materials`
- verify `/admin/materials/import`
- verify create/edit/archive flow
- verify import preview/commit using a workbook copy, not the live sheet directly

---

## Open product questions to resolve before implementation starts

1. **One current price or multiple equal-status vendor prices?**
   - Recommendation: one canonical default price on `materials` plus many vendor-specific rows in `material_vendor_prices`

2. **Should operators edit canonical material and vendor-price rows on the same screen?**
   - Recommendation: yes for v1, but keep the UI visually separated

3. **Should import commit auto-create vendors from unseen vendor names?**
   - Recommendation: yes, but through a normalized vendor creation/match path and with alias logging

4. **Should material search include inactive rows by default?**
   - Recommendation: no, but allow toggling inactive on

5. **Do we need xlsx export in v1?**
   - Recommendation: no. CSV can wait. Search + CRUD + import are higher priority.

---

## Final recommendation

Build this as a **materials catalog module inside MDP Tracker**.

### v1 definition of done
- workbook imports through staging + normalization
- admin-only materials list/search page exists
- materials can be created/edited/archived in the app
- vendor-specific price rows are supported
- audit log exists
- Paul can stop editing the spreadsheet and use the app as source of truth

### What not to do first
- do **not** start with email inbox ingestion
- do **not** start with BILL AP sync
- do **not** import directly from the workbook into production catalog tables
- do **not** make invoice/BILL transaction text the canonical material identity model

### 72-hour cut line if speed matters
If Joe wants the fastest high-confidence first ship, cut the workline here:
1. schema + staging import
2. normalization for all 5 tabs
3. `/admin/materials` search/list page
4. edit/archive/create
5. import preview + commit

That is the real cutover MVP.