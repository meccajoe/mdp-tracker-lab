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
- Focused metric tests pass 7/7; TypeScript and `git diff --check` pass.
- No production schema or runtime service has been changed.
- Next step: RED schema contracts for durable reconciliation cases, audit events, canonical labor summary, and transactional RPCs.

## Safety boundary

- Financial source data remains read-only.
- New writes are limited to reconciliation case workflow and audit events.
- No QBO posting, expense/labor mutation, notification, or automatic accounting correction.
- Do not deploy until focused tests, full regression, TypeScript, production build, migration-state verification, and targeted schema read-back pass.
