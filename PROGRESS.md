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

- Accounting Review UX v2 is deployed at commit `f8fcd02` on `origin/main`; primary checkout is `release/accounting-review-20260917` and local `main` points to the same commit.
- The first screen now follows the familiar Projects pattern: one full-width desktop table (mobile cards below `lg`) with Project, PM, Review status, What needs attention, What it likely means, Assigned to, and Review project columns/actions.
- Raw QBO-versus-Tracker evidence is secondary and expands inline. Every review now includes a plain-English explanation, explicitly hypothetical common checks, a recommended next step, separately defined QBO accounting and Tracker project-evidence blocks, and the governed assignment/status/history workflow.
- Guidance covers QBO-higher cost, Tracker-higher cost, contract-versus-billings revenue differences, missing QBO totals, stale QBO data, missing Tracker contract, missing labor rates, and within-tolerance rows. Missing rates and stale data block premature conclusions.
- Async workflow hardening prevents a slow case-history request from appearing under another project and isolates queue-load/refresh request generations so a date change cannot leave refresh stuck.
- Dormant quote-publication/provider work remains preserved on `wip/quote-to-production-release-4-provider` at `cbd8076` and was not shipped.
- Production Supabase migration `20260917123000` remains applied and recorded. No migration changed in UX v2.
- PM2 `mdp-tracker` was rebuilt with `.env.local` and restarted. Local `/admin/reconciliation` returns 200, all 19 referenced assets return 200, and unauthenticated `/api/admin/reconciliation` returns 401. Public browser reaches the Tracker Google login boundary.
- Verification: 504/504 tests, 17/17 focused UX/API/mobile/guidance tests, TypeScript, diff checks, independent blocking review, and the full 52/52-page production build.
- No scan was run and no reconciliation cases, audit events, QBO records, or Tracker financial records were changed by this UX rollout.

## Next controlled action

- Joe or another Tracker admin signs in and reviews the live table/explanation flow. Do not run `Refresh QBO & review` until the redesigned queue is understood and accepted; that remains the first workflow write.

## Safety boundary

- Financial source data remains read-only.
- New writes are limited to reconciliation case workflow and audit events.
- No QBO posting, expense/labor mutation, notification, or automatic accounting correction.
- Do not deploy until focused tests, full regression, TypeScript, production build, migration-state verification, and targeted schema read-back pass.
