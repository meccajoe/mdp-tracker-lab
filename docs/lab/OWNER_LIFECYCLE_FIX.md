# Owner lifecycle policy fix — 2026-09-30

Base: PR 1 cc702a5b79a4fec1ecf8a50a16c8de65b59a8a1c. Local branch: codex/lab-owner-archive. No push, merge, deploy, hosted grants or production changes.

## Scope and local review
The actual append_quote_workflow_event and restore_quote_workspace SQL already authorize an active workspace owner, or an active member holding archive_workspace. The shared API helper now matches that owner exception for Archive/Restore only. Collection GET computes per-workspace controls using verified identity, exact active membership and nonrevoked capabilities; capability lookup errors fail closed. Both responsive library layouts render the same tested component and hide unauthorized controls. Mutations retain independent authorization, lifecycle and concurrency checks. Restore still uses archive_workspace; no new capability was invented. Commercial, publication and operations authority are unchanged. Database migrations were not changed.

Local diff review checked identity binding, membership removal, capability revocation, viewer boundaries, unknown/missing permission data and archived writes. No external code review transmission occurred. The vet skill requires its CLI after logical changes, but CLI has no offline review mode: --max-spend 0 rejects before review. Vet is blocked, not passed.

## Validation
- Actual route/helper/UI regression: 11/11 pass. Uses real route exports and authorization/component code, with external session/service I/O mocked; not a live browser session.
- Isolated PGlite lifecycle + workbook tests: 2/2 pass using actual migration functions, synthetic auth/table setup and database roles. Owner archive/restore, explicit nonowner capability, viewer/missing/revoked membership denial, archived workbook write denial, concurrency and audit are exercised. Auth stubs do not claim real hosted JWT/RLS verification.
- TypeScript --noEmit: exit 0.
- Full first run: 660 tests, 652 passed, 8 failed. Untouched baseline: 648 tests, 641 passed, 7 failed. Eighth was old owner-denial assertion, now corrected to approved policy.
- Full rerun under Node22/tsx: 636 tests, 624 passed, 12 failed: same seven plus five intermittent dependency package-reading errors. Affected five files plus updated domain suite individually rerun: 38/38 pass.
- Three native .mjs suites under Node26: 28/28 pass; their named-export failures under tsx were loader-specific.
- Optimized webpack build could not finish: ENOSPC writing webpack cache with ~350 MB disk available. Stopped own process and removed only generated .next cache. Build is blocked, not passed.
- Final complete inventory (250 files) using Node26 and the appropriate loaders: typed 516/519; remaining JS 137/138; three native suites 28/28. Total 681/685 pass, four inherited contract failures: Ada environment example expects omitted ADA_LLM_API_KEY; pricing page source assertion expects project_pricing_index inline; Joe-only product assertion disagrees with existing Paul allowlist; production labor cron assertion expects a schedule intentionally removed in Lab. All four also fail on untouched baseline. No new failures in final inventory. Logs: /tmp/lab-full-native-final.log (typed part), /tmp/lab-js-final.log, /tmp/lab-native-tests.log.

## Hosted evidence and remaining acceptance
Existing preview on cc702a5b passed sample travel selection, UI save/reopen provenance persistence, and manual airfare edit clearing only airfare evidence. The synthetic owner Archive attempt failed at API authorization; fixture stayed draft and no archive event was emitted. Viewer and archived hosted flows remain NOT RUN. New local code is not deployed, so hosted owner Archive/Restore acceptance is NOT RUN. No existing authenticated viewer fixture was available and none was created or granted access. See external session evidence tracker-lab-acceptance-evidence.md and tracker-lab-archive-diagnosis.md.

Publication decision remains with Joe. A clean build needs disk space and rerun. Full-suite inherited failures should be assessed separately; no unrelated sanitation or integration settings were changed to satisfy those tests.
