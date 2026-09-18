# MDP Tracker Progress

## Active workstream

**Accounting Review — labor-rate integrity and payroll authority**

- Owner: Ferris
- Branch: `ferris/labor-rate-root-cause`
- Worktree: `/tmp/mdp-labor-rate-root-cause`
- Baseline: deployed Accounting Review UX v2 continuity commit `fb22afc`
- Production remains unchanged; dormant quote-publication/provider work remains preserved.

## Goal

Resolve the dominant “hours with no verified pay rate” exception without treating an unproven positive value as verified, valuing missing labor at zero, rewriting immutable QBO Time history, or conflating QBO accounting actuals with Tracker operational labor cost.

## Current state

- Read-only audit found `4,802.54` unverified canonical QBO Time hours across `37` affected worker profiles and `99` projects under the strict provenance rule.
- Root causes are missing hourly/contractor cost rates, salaried allocation-policy gaps, deleted/duplicate profiles, three unclassified contractor designers, and legacy positive rates lacking approved provenance.
- Joe supplied `FRIDAY PAYROLL RATES _1_.xlsx`; workbook metadata says modified `2026-08-14T16:21:36Z`, header baseline is `2025-02-10`, and SHA-256 is `610f84a5f2022735e61daa0da21cf2f708516a4c16caac38d0d50fba6cbf040b`.
- A verified durable local copy is stored outside Git at `~/.local/share/archie/mdp-tracker/payroll/FRIDAY_PAYROLL_RATES_2026-08-14.xlsx`.
- Preview generated `76` effective-dated authority records from `84` positive-rate workbook rows. It reports an explicit outcome for every named workbook row, including missing/nonpositive rates, terminated rows, duplicate supersession, invalid classifications, and imports; active duplicate rows beat terminated duplicates; source-row identity is preserved; explicit hire/rehire and rate-change dates are respected; Juan Sanchez is `$22` from his first observed covered work through `2026-03-01` and `$24` from `2026-03-02`; Adam Gonzalez remains blocked because the sheet marks him terminated while QBO Time contains later work.
- Joe confirmed Rodrigo L, Marcelo T, and Mariam H are contractor designers. The import preview records that classification but does not invent rates.
- Projected safe recovery: the effective-dated payroll sheet covers `4,453.34` hours / `$113,236.14` base labor cost, or `92.73%` of currently unverified hours. Where both sources exist, the approved payroll interval wins by work date; a trusted QBO Time rate is only the fallback when the active payroll authority has no applicable interval.
- Remaining after the controlled import: `349.20` hours — Rodrigo L `108.11`, Marcelo T `104.71`, Mariam H `93.44`, Adam Gonzalez `20.36`, Paul M. Mecca `18.53`, Emily D Kuhl `4.05`; the zero-hour legacy Larry Newman profile has no financial effect.
- Implementation does not rewrite QBO Time rows to apply payroll rates; it joins approved payroll authority by normalized worker identity and work date. Authority rows belong to an approved source manifest, are append-only, and retain source hash, workbook/row identity, effective dates, approval, supersession, and revocation evidence.
- TSheets sync preserves previously verified historical rates, does not preserve unproven legacy defaults, retains immutable QBO Time user IDs/salaried status, and no longer has two identical nightly jobs.
- Accounting Review guidance now identifies affected worker profiles and distinguishes hourly, salaried, contractor, and deleted/duplicate-profile causes.
- Preview artifact: `/tmp/mdp-payroll-rate-import-preview.json`; impact projection: `/tmp/mdp-authority-projection.json`.

## Verification completed

- Payroll authority helper: `8/8` tests passed.
- Full regression: `622/622` tests passed.
- TypeScript and `git diff --check` passed.
- Production build passed all `52/52` static pages with the real environment loaded.
- Disposable PostgreSQL 18.3 verification passed: replacement of the existing reconciliation view without changing its original column order, migration apply, effective-dated payroll-over-QBO precedence, atomic authority-plus-classification import, idempotent retry, authenticated read-only enforcement, service-role direct-write denial, append-only authority enforcement, revocation exclusion, explicit atomic supersession, invalid-classification rollback, and preservation of the prior active authority after a failed replacement.
- No production migration, payroll import, QBO mutation, Tracker source-row rewrite, broad reconciliation scan, case creation, or PM2 restart has occurred.

## Next controlled action

1. Confirm the hourly/cost rates for Rodrigo L, Marcelo T, and Mariam H.
2. Confirm whether Adam Gonzalez’s post-termination QBO Time entries represent a valid rehire and whether `$37.50` applies.
3. Decide the salaried labor allocation basis for Paul M. Mecca and Emily D Kuhl.
4. After those decisions—or approval to leave them explicit exceptions—commit/push the branch, run full regression/build review, deploy the schema/code, run the hash-confirmed payroll import, read back the imported authority/classification records, run the controlled labor sync, and re-audit coverage before any Accounting Review queue scan.

## Safety boundary

- QBO remains authoritative for accounting income, cost, profit, and margin.
- Tracker labor authority affects operational direct-labor evidence only.
- The import is preview-first and hash-confirmed; it inserts auditable authority records instead of overwriting QBO Time source rows.
- Unknown contractor rates and salaried allocation costs remain explicit missing-rate exceptions.
- Do not deploy or import until the remaining policy decisions are confirmed or explicitly accepted as unresolved exceptions.
