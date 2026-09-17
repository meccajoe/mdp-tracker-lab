# Accounting Review Slices 1–3 Implementation Plan

> **For Hermes:** Use strict RED → GREEN TDD for every behavior. This branch is isolated from dormant quote-publication work.

**Goal:** Replace the stale QBO reconciliation prototype with an authenticated, durable Accounting Review queue that separates QBO accounting actuals from Tracker operational evidence and gives Paul’s team actionable review state.

**Architecture:** Use `qbo_project_wip_metrics` / QBO `ProjectProfitabilitySummary` as the only accounting-actual source. Build one pure metric contract for revenue variance, cost variance, labor completeness, source freshness, category, severity, reason, and next action. Persist only review workflow state and immutable events; financial source data remains read-only. Expose the queue through admin-authenticated server routes and render a responsive dense table plus focused detail panel.

**Tech Stack:** Next.js 16, React 18, TypeScript, Supabase/Postgres, Node test runner with `tsx`, existing Tracker UI primitives.

---

## Product and metric locks

- QBO actual income, cost, profit, and margin come only from `qbo_project_wip_metrics` populated from `ProjectProfitabilitySummary`.
- Tracker operational evidence remains separately labeled: contract amount, imported expenses, canonical TSheets hours, verified direct base wages, and missing-rate hours.
- Never present direct base wages as QBO payroll expense.
- Never convert Design or PM budgets into actuals.
- Missing source values remain unknown and actionable; they never coerce to zero variance.
- Revenue variance and cost variance are independent.
- QBO retainage remains unavailable/null until a validated source exists.
- A stale source creates a freshness action before a financial conclusion.
- The first release may write case workflow state only. It does not write QBO, expenses, labor, contracts, or other financial source records.

## Task 1 — Pure reconciliation metric contract

**Create:**
- `src/lib/financial-reconciliation.ts`
- `src/lib/financial-reconciliation.test.ts`

**RED tests:**
- complete source population returns separate accounting and operational values;
- revenue and cost variances are calculated independently;
- null QBO actuals remain null and become a missing-source reason;
- missing-rate hours are explicit and do not add zero-dollar labor;
- stale QBO data produces freshness-first action copy;
- category/severity/reason/next-action copy is deterministic and plain English;
- fingerprint input is stable under timestamp-only changes and changes under material metric changes.

**GREEN implementation:** one pure row builder and deterministic SHA-256 case fingerprint helper. No arithmetic in JSX.

## Task 2 — Durable case schema and transitions

**Create:**
- `supabase/migrations/20260917123000_financial_reconciliation_cases.sql`
- `src/app/admin/reconciliation/financial-reconciliation-schema.contract.test.ts`
- `tests/sql/financial-reconciliation-harness.sql`

**Schema:**
- `financial_reconciliation_cases`: one durable workflow case per fingerprint; project, as-of date, category, severity, status, owner, metric/source snapshots, reason/action, resolution, row version, first/last seen, reopen count.
- `financial_reconciliation_case_events`: append-only actor/timestamp/status/comment history.
- `project_labor_reconciliation_summary`: canonical `ts_*` labor totals, verified-rate hours/cost, and missing-rate hours.
- Service-role-only table writes; browser roles revoked.
- Transactional RPCs for scan observation/upsert/reopen and operator transition/comment/assignment.

**RED/GREEN contracts:** exact tables, allowed states/categories, fingerprint uniqueness, RLS/revokes, indexes, view, RPC signatures, idempotent same-fingerprint scan, one-time reopen, and append-only events.

## Task 3 — Authenticated server read/scan/mutation API

**Create:**
- `src/lib/financial-reconciliation-server.ts`
- `src/app/api/admin/reconciliation/route.ts`
- `src/app/api/admin/reconciliation/scan/route.ts`
- `src/app/api/admin/reconciliation/cases/[caseId]/route.ts`
- focused API/server tests and source contracts.

**Behavior:**
- Every route uses `requireProjectAdmin(request)`.
- GET returns normalized queue rows, source freshness, counts, filters, case state, and event history without browser service-key access.
- POST scan reads one explicit as-of population, uses canonical labor summary, and persists idempotent cases through the RPC.
- Partial/project-filtered scans never supersede unrelated cases.
- PATCH supports assignment, review/waiting/resolved transitions, category correction, and notes with actor history.
- Resolution requires a code and notes; expected differences remain reviewed resolutions.
- No route writes financial source records or calls the obsolete `qbo_project_pnl` path.

## Task 4 — Operator Accounting Review queue

**Replace:**
- `src/app/admin/reconciliation/page.tsx`

**Create/update:**
- page source contract tests;
- existing mobile admin layout contract as needed.

**UX:**
- Heading `Accounting Review`; no under-development banner or KPI-card wall.
- Compact queue summary with explicit QBO as-of/sync timestamp.
- Filters: search, queue status, project status, owner, category, freshness, material-only.
- Desktop: dense action table.
- Phone: tappable mobile list and full-width detail state.
- Detail panel: decision summary, source freshness, QBO accounting actuals, Tracker operational evidence, separate revenue/cost variances, labor coverage, evidence links, owner/status/category, notes/history, and next action.
- Restrained red only for urgent/material action states.
- All API calls use current bearer session plus credentials; stale request responses cannot overwrite newer state.

## Task 5 — Verification and rollout

1. Install declared dependencies inside the worktree; do not symlink `node_modules`.
2. Run each focused RED/GREEN test during implementation.
3. Run all discovered TypeScript tests using the repo’s Node/tsx convention.
4. Run `npx tsc --noEmit`, `git diff --check`, and a production build.
5. Audit the complete branch diff and migration state.
6. Verify remote schema before apply; apply only the targeted idempotent migration.
7. Verify tables, view, RPCs, privileges, and zero/expected initial case state.
8. Reconcile into the primary checkout only after its dormant branch state is explicitly handled; do not mix the two branches.
9. Restart only the `mdp-tracker` service after authoritative build verification.
10. Verify anonymous 401, non-admin 403, protected page redirect, public/local route health, and authenticated queue when a safe session is available.
11. Pilot with 10 material projects including 26154 before adding notifications.

## Acceptance criteria

- Reconciliation no longer reads `qbo_project_pnl`.
- Every displayed amount has a named source and as-of timestamp.
- Revenue, cost, labor completeness, and freshness are separate signals.
- Unchanged scans do not duplicate cases or history noise.
- Resolved cases reopen only after a material fingerprint change or explicit recurrence rule.
- Paul’s team can see owner, status, reason, next action, evidence, and history for every queue item.
- No automated financial correction, QBO posting, Slack notification, or email is introduced.
