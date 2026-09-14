# Release 3 Quote Review Slice Implementation Plan

> **For Hermes:** Implement directly with strict RED → GREEN → REFACTOR. Do not enable approval, publication, project creation, provisioning, readiness, or operational release.

**Goal:** Keep the unfinished Quotes product Joe-only while adding a read-only, table-based review surface for the current normalized quote revision.

**Architecture:** Add a centralized product-preview allowlist enforced by the server access helper, Quotes pages, and every `/api/quote-workspaces` alias. Add one actor/workspace-authorized read endpoint that assembles the current revision, commercial lines, Build Items, line mappings, labor allocations, workflow events, and derived review exceptions. Render the result as a compact tabbed operational review surface beside the existing workspace.

**Tech Stack:** Next.js App Router, React/TypeScript, Supabase/PostgreSQL, Node test runner with tsx, PM2.

---

### Task 1: Enforce Joe-only preview access

**Files:**
- Create: `src/lib/quote-product-access.ts`
- Modify: `src/lib/ada-server.ts`
- Modify: `src/app/api/quotes/access/route.ts`
- Modify: `src/app/quotes/page.tsx`
- Modify: `src/app/quotes/[workspaceId]/page.tsx`
- Modify: all routes under `src/app/api/quote-workspaces/`
- Test: `src/app/quotes/release3-review-slice.contract.test.ts`

1. Write runtime and source contracts for both approved Joe emails and denial of all other identities.
2. Run the focused test and confirm RED.
3. Add centralized allowlist and server helpers.
4. Wrap every product API alias and direct product page.
5. Run focused tests to GREEN.

### Task 2: Add normalized review API

**Files:**
- Create: `src/app/api/quote-workspaces/[workspaceId]/review/route.ts`
- Test: `src/app/quotes/release3-review-slice.contract.test.ts`

1. Add RED assertions for exact normalized tables, current revision scoping, work-type enrichment, workflow history, and no mutation verbs.
2. Implement one read-only GET route behind Joe-only product and workspace membership checks.
3. Return explicit empty state when no current revision exists.
4. Derive review exceptions only from persisted statuses; do not invent financial or operational facts.
5. Run focused tests to GREEN.

### Task 3: Add dense Review workspace

**Files:**
- Create: `src/components/quote-review-workspace.tsx`
- Modify: `src/components/quote-workspace.tsx`
- Test: `src/app/quotes/release3-review-slice.contract.test.ts`

1. Add RED assertions for Workspace/Review tabs and tables for Commercial lines, Build Items, Labor allocation, Revisions/events, Exceptions, and Approval state.
2. Build a read-only client using `/api/quote-workspaces/[workspaceId]/review`.
3. Lead labor displays with hours and use compact tables on desktop with mobile-safe overflow.
4. Keep all approval/publication/release controls absent.
5. Run focused and adjacent Release 3 tests to GREEN.

### Task 4: Verify and roll out

1. Run the complete discovered test suite.
2. Run TypeScript and production build.
3. Run `git diff --check` and credential scan.
4. Commit and push the Release 3 branch.
5. Restart only `mdp-tracker` with `--update-env`.
6. Verify local/public health, route assets, Joe-only API behavior where safely possible, and record authenticated-browser limitations honestly.
7. Update `PROGRESS.md` and `memory/projects/mdp-tracker.md`, then commit/push the rollout record.
