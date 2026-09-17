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

- Slices 1–3 are deployed at commit `279f40f` on `origin/main`; primary checkout is `release/accounting-review-20260917` and local `main` points to the same commit.
- Dormant quote-publication/provider work remains preserved on `wip/quote-to-production-release-4-provider` at `cbd8076` and was not shipped.
- Production Supabase migration `20260917123000` is applied and recorded. Live read-back confirms zero cases/events, one active case per project, serialized project observations, immutable category identity, service-role-only workflow access, and denied anonymous table reads.
- PM2 `mdp-tracker` was rebuilt with `.env.local`, restarted, and serves the new route. Local `/admin/reconciliation` returns 200, all 19 referenced assets return 200, and unauthenticated `/api/admin/reconciliation` returns 401.
- Public browser reaches the Tracker Google login boundary. Authenticated visual sign-off remains pending because Joe's Google account is signed out and the automation session cannot unlock 1Password.
- Read-only deployed payload audit for 2026-09-15: 176 projects, 152 computed needs-action, 11 waiting for fresh QBO, 13 ready, 95 with missing-rate hours, and 0 durable cases until an admin explicitly runs `Refresh QBO & review`.
- Project 26154 read-back: QBO cost `$75,103.79`, Tracker operational cost `$28,168.30`, cost variance `$46,935.49`, missing-rate labor `21.28` hours, category `missing_labor_rate`, fresh source, no case yet.
- Verification: 493/493 tests across 197 files, TypeScript, diff checks, full 52/52-page production build, two consecutive disposable PostgreSQL migration applies, and behavioral SQL harness.

## Next controlled action

- Joe or another Tracker admin signs in, opens `/admin/reconciliation`, verifies desktop/mobile layout, then intentionally runs `Refresh QBO & review` to create the initial durable queue. This is the first workflow write and was deliberately not executed during deployment.

## Safety boundary

- Financial source data remains read-only.
- New writes are limited to reconciliation case workflow and audit events.
- No QBO posting, expense/labor mutation, notification, or automatic accounting correction.
- Do not deploy until focused tests, full regression, TypeScript, production build, migration-state verification, and targeted schema read-back pass.
