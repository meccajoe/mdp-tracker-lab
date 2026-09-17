# MDP Tracker Progress

## Active workstream

**Accounting Review — Slices 1–3**

- Owner: Ferris
- Branch: `ferris/reconciliation-slices-1-3`
- Worktree: `/tmp/mdp-tracker-reconciliation`
- Baseline: `origin/main` at `e5349d2`
- Primary checkout remains on local dormant quote-publication commits and must not be overwritten or merged implicitly.

## Goal

Replace `/admin/reconciliation` with an authenticated operational queue using QBO ProjectProfitabilitySummary actuals, separately labeled Tracker operational evidence, explicit data freshness, missing-rate labor exceptions, and durable owner/status/reason/history.

## Current state

- 2026-09-17 audit completed and recorded in project memory.
- Architecture and operator-UX reviews completed read-only.
- Implementation plan: `docs/plans/2026-09-17-accounting-review-slices-1-3.md`.
- Slice 1 metric contract implemented with strict RED/GREEN in `src/lib/financial-reconciliation.ts`.
- Focused metric tests pass 7/7; fingerprints ignore date/timestamp-only refreshes but change with material values.
- Slice 2 migration adds governed case/event tables, canonical labor completeness view, and transactional observe/transition RPCs.
- Schema contracts pass 4/4. Disposable PostgreSQL 18 migration apply, second idempotent apply, and behavioral SQL harness all pass (`financial_reconciliation_harness_ok`).
- TypeScript and `git diff --check` pass. No production schema or runtime service has been changed.
- Slice 3 adds admin-authenticated queue/scan/case APIs, a server-normalized read model, and the responsive Accounting Review operator queue.
- Focused reconciliation/API/UI/mobile contracts pass; the full repository regression suite passes 486/486 across 195 test files.
- Next step: commit Slice 3, rebase onto the current primary checkout, run the production build and read-only live data/schema audit.

## Safety boundary

- Financial source data remains read-only.
- New writes are limited to reconciliation case workflow and audit events.
- No QBO posting, expense/labor mutation, notification, or automatic accounting correction.
- Do not deploy until focused tests, full regression, TypeScript, production build, migration-state verification, and targeted schema read-back pass.
