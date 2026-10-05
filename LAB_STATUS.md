# Lab status

## Undo/Redo and clear item assignment — October 5, 2026
- Paul requested multi-step Undo and Redo across all quote tabs. Added a shared 100-action session history, grouped typing per field, full snapshot restoration (including linked catalogs/overrides), no-op suppression, redo invalidation on a new edit, and saved-baseline dirty tracking. Saving retains session history; loading/reopening resets it. Saved revisions remain append-only and unchanged. Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y supported within the workbook.
- Replaced the Takeoffs item-name datalist (which exposed IDs like line-5 and confusing text-filtered results) with an ordered item selector. Names only; duplicate names use the visible quote row number. Help explains row assignment and where to rename the item. Stable IDs remain internal and paste/fill linkage stays intact.
- Local real-component browser check passed: five Takeoffs changes -> five Undo -> saved baseline -> five Redo; first Undo directly from a still-active Notes field; multi-digit rate typing restores in one step; cross-tab actions; repeated keyboard Undo/Redo including active-cell text restoration. 51 automated tests (three new history regressions), full TypeScript and diff checks pass for the final source. Deployment/hosted acceptance follows.

## Item-labeled material and labor worksheet — October 4, 2026
- Shipped d7239de; Vercel success independently verified at https://vercel.com/meccanics/mdp-tracker-lab/BXVYZYAnRTRMaqyqWfaTokC6cHDt. Real hosted verification in dedicated workspace e2f2b7b9-0d56-4f94-9af4-9675660d3bdc: 50 rows without dirtying; named Brown Wall with plywood 10 × $150.68 and Carpentry 48 hours, Red Wall with hardware 2 × $25 and notes; saved revision 2 and Reload saved retained labels, costs, hours and notes. Quote Builder rolled up Brown Wall $1,506.80 materials/48 hours and Red Wall $50 materials. Add 50 more rows yielded 100 without dirtying. Desktop screenshot reviewed. Live endpoint returned 700 choices and its timestamp advanced during editing. No real source-sheet addition was made; addition detection remains fixture-tested rather than business-sheet mutation. Physical-device touch testing remains unverified.
- Paul clarified with a populated Takeoffs screenshot and read-only reference spreadsheet 1COzb0eiQ1zvPb_1vF58dYSTgTC7vSPw0ap6XnCHkL0E, Takeoffs A1:K35. Multiple material/labor rows must visibly repeat the parent item name, with all items on one page.
- Added a Working on item selector and item-name editor (renames propagate through stable IDs), explicit searchable Description dropdowns with all/material/labor-hour choices, item boundary separators, source-style dark headings and pale yellow inputs, green looked-up values, dollar-formatted unit costs, and frozen item heading. 50 initial rows and Add 50 more rows remain. Existing rows keep their assignments; new rows use the selected item. No math/schema changes or source workbook writes.
- Isolated browser verified plywood quantity 10 at $150.68 -> $1,506.80, Carpentry/48 hours under the same named Brown Wall, Hardware under Red Wall, labels and hours after save/reload, and one-click searchable dropdown. Hosted acceptance now completed as recorded above. 48 existing tests and full TypeScript pass for this update.
- Previous live-catalog source d7584a5 has successful Vercel deployment: https://vercel.com/meccanics/mdp-tracker-lab/6fGdvzEqCqz5Btc7niTjo5f1dPhM. Actual signed-in creation and revision-1 save/reload now verified in dedicated workspace e2f2b7b9-0d56-4f94-9af4-9675660d3bdc (Lab verification — live catalog — Oct 4). The previous create_workspace blocker is resolved. Existing quote test untouched. Full updated hosted takeoff acceptance follows.

## Live Materials DB and sheet-aligned takeoffs — October 4, 2026
- Read-only source verified via Google Drive metadata and CSV GET: Materials DB spreadsheet 1Z34DH5kc3c7K9g-yOUyzF_sEhhNPFZeIdfh1gMTNL-0, gid 1318845246. Added an authenticated, uncached catalog endpoint pinned to this source; no service credentials, sheet mutations or sharing changes. Other lab integration guards remain intact. AGENTS.md records Paul's narrow authorization.
- Takeoffs now follows reference gid 1132319826: Line item, Description lookup/free typing, Qty, Unit, Unit cost, Section ×, Resale, Material total, Labor hrs, Ext hrs, Notes; Trade is appended for existing attribution. Description selection fills catalog unit/cost; notes and unit overrides persist as optional backward-compatible snapshot fields. Main pricing formulas are unchanged.
- Live choices refresh every 15 seconds while the tab is visible, on focus, or with Refresh now. Existing row costs stay frozen until explicitly using the selected-row latest-price action. This is the recommended default pending a different business-rule answer from Paul. Manual zero/nullable overrides remain separate; historical revisions are untouched. Live identity includes description/unit/price/type, so price changes do not overwrite old references.
- Actual reader returns 700 valid entries; source row 704 (Z Clips) has no unit/price and is excluded with a visible warning. Priced Equipment/By Vendor/blank-type entries are supported; blank-price Labor entries have zero material cost. Reader uses source-supported rows 5–1004 and rejects ambiguous duplicate descriptions, invalid costs and malformed exports. Google export propagation may add latency beyond polling; no instant/push guarantee.
- 48 tests and full TypeScript pass. Production build passes with placeholder lab keys. Isolated browser with actual Google reader verified acrylic description → each/$1,190.40 → quantity 2/$2,380.80; drag-filled lookup into rows 2–3; zero override, keyboard clearing back to catalog cost, and Notes save/reload. Empty locator fill did not clear the field in browser automation; real keyboard select-all/delete did. No source test items were inserted into the live business spreadsheet; dynamic additions verified with changing-response fixtures.
- Earlier 50-row commit 4c44c11 deployment verified successful: https://vercel.com/meccanics/mdp-tracker-lab/5LnxuTrMcgNHetjQ8hdEEAPjunTc. Live catalog deployment/hosted acceptance follows.

## Ready-to-type Takeoffs — October 4, 2026
- Takeoffs opens with 50 editable rows; Add 50 more rows expands the worksheet up to the existing 5,000-row limit. Opening/expanding alone does not dirty or change the quote. Editing a later row materializes zero-value blank rows before it to preserve row positions on save/reload. New rows use the selected/first existing item. Existing records and price math remain intact.
- 44 tests and TypeScript pass. Isolated browser verification: 50 rows initially, typed in row 50 without adding anything, expanded to 100, typed quantity in row 51, saved/reloaded both values. Production build passed with placeholder lab keys. Hosted verification pending deployment.
- Paul reports Joe granted create_workspace and hosted quote creation now works; this is user-reported, not independently reverified in this session.
- Follow-up authorization: Paul explicitly requests a read-only live connection to Materials DB 1Z34DH5kc3c7K9g-yOUyzF_sEhhNPFZeIdfh1gMTNL-0, gid 1318845246. Connector metadata/header reads and unauthenticated CSV export succeeded. This is a narrow user-authorized exception to the prior no-live-Sheets rule; no sheet writes, sharing changes or other integrations. Implementation follows separately.

## Compact workbook and continuous takeoffs — September 30, 2026
- Paul requested soft colors, smaller text and less scrolling across the quoting tool, plus one continuous takeoff worksheet and spreadsheet editing. Added pastel tab/input/header colors, tighter spacing, and narrower Quote Builder columns. Rates retains %/$/unit adornments.
- Takeoffs now shows every item in one table, with stable Item links, catalog and trade name lookup, ten-row insertion, literal column drag-fill, Shift-click range copy, rectangular TSV paste, Tab navigation and a 30-edit undo history. Calculated totals are protected. Blank cost/sections retain their existing meanings; explicit zero remains distinct. Invalid bulk edits are rejected atomically. Add/rename item definitions in Quote Builder; ambiguous names require the exact stable ID offered by the lookup.
- No pricing engine, schema, saved quote or revision migration changes. Drag-fill repeats values; it is not an Excel formula/series engine. It fills visible target rows in one column; no auto-scroll during dragging. Native keyboard/text editing remains available on phones.
- Verification: 41 calculator/estimator/validation/grid/safety tests and TypeScript passed; production build passed with placeholder lab keys. Local browser adapter verified description drag-fill and undo; 2x4 numeric paste produced $25/3 hours and $40/2 hours; range copy reproduced the TSV; reassigned the second row to Item 2; local save/reload retained it. Desktop Rates/Takeoffs/Estimators reviewed. At 390px, Estimators and Takeoffs stayed within page width, with internal worksheet scrolling. Physical touch gestures and hosted save/reopen remain unverified.
- Shipped as dc16ad5. GitHub's Vercel check reports successful deployment at https://vercel.com/meccanics/mdp-tracker-lab/HQYxdi991fFFEgGq8bmwj76UTTTH. Paul's existing create_workspace permission blocker still prevents real hosted quote verification. Local test data stays only in the temporary browser preview.

## Rates tab readability — September 30, 2026
- Shipped as dfa22c9; GitHub Vercel status confirms successful deployment at https://vercel.com/meccanics/mdp-tracker-lab/7tkkVLHskeCoAwTrXYGnz6aoXSpQ. The hosted Rates view still requires an accessible quote workspace; use the isolated local preview to review the layout until Paul's capability is granted.
- Replaced dense settings cards with spreadsheet-style sections for global parameters, fabrication, graphics/SEG, professional services, install/travel, pass-throughs and trade labor. Yellow editable values, aligned notes, and green calculated labor costs distinguish inputs from results.
- Rates now shows/accepts human percentages (10 = 10%, stored as 0.10), $ on monetary fields including wages, × on multipliers and units for hours/minutes/people. Pinned labor override remains nullable with explicit restore and valid zero. No calculator, database schema or snapshot migration changes.
- All 37 existing quote/validation/safety checks, full TypeScript and placeholder-key production build pass. Browser-local adapter check passed: 10% commission, 7.5% contingency, $120 labor sell, $0 pinned override/restoration, and save/reload. Independent example: $100 materials + 2 hours gives $512.71 including PM with 10% commission; contingency $38.45. Restored the isolated preview to blank/default inputs afterward.
- Desktop screenshot and 390px phone-sized viewport reviewed; Rates page width stays 390px without horizontal overflow, notes wrap below values. This is responsive emulation, not physical-device testing. Actual hosted persistence remains blocked by Paul's create_workspace capability.

## Shared source and hosted deployment verified — September 30, 2026
- GitHub CLI authenticated as pl285; GitHub API confirms push permission for meccajoe/mdp-tracker-lab. Pushed dd018d2 (spreadsheet UI) and df1509f (multi-Mac setup) to main.
- Vercel status for df1509f reports success, “Deployment has completed”, at https://vercel.com/meccanics/mdp-tracker-lab/5RMQcESii7oAcyjvtevLgLu4BLNG. Shared application URL is https://mdp-tracker-lab.vercel.app/quotes, not the localhost preview.
- Real Google sign-in as paul@meccadesign.com succeeded; dashboard and Quotes library load. Quote library is empty for Paul. Attempted clearly named test workspace “Cross-device verification — September 30”; server rejected it with “Quote capability create_workspace is required.” No test quote/revision was created. Dialog cancelled after verification.
- Remaining blocker: authorized lab administrator must grant Paul the create_workspace capability in public.quote_user_capabilities, bound to his actual lab auth identity, with grant actor/reason recorded. Do not bypass API/RLS checks or replay old membership migrations. After grant, verify real save/reopen and then the same quote on a second device. Existing workspace membership is separately required to share someone else's quote.
- Code and working notes are now shared through GitHub; separate devices require their own sign-in/checkout. Hosted quote access works up to the capability gate. Do not claim end-to-end cross-device quoting is verified yet.

## Multiple-Mac development setup — September 30, 2026
- Paul requested work across several Macs. Added docs/lab/MULTI_MAC.md, a lab-only README, .nvmrc, npm run lab:doctor and npm run lab:check. Preserved the inherited README as explicitly historical reference. AGENTS.md now records handoff expectations.
- Shared code/context travels through GitHub commits and working notes; shared saved quotes use the same account/workspace on the hosted lab. The temporary localhost preview and unsaved edits do not sync. Second-Mac and hosted quote acceptance remain unverified.
- Installed GitHub CLI 2.101.0 and Homebrew Node 24.21.0/npm 11.19.0 on this Mac; Node PATH added to .zprofile. Package dependency versions and lockfile unchanged. The check runner passes all 37 tests and TypeScript on bundled Node 24.19.0; Node 24.21.0 check also invoked for runtime confirmation.
- Homebrew reported incomplete ca-certificates/openssl postinstall steps, including on retry. Node/npm version commands and quote checks run; do not claim those separate system postinstall steps succeeded. No certificate-validation bypass applied.
- GitHub CLI browser authorization started; waiting for Paul's completion. Git push/deployment and other Macs are not yet verified. Existing pending spreadsheet-style commit is dd018d2.

## Spreadsheet-style Quote Builder implementation — September 29, 2026
- Access to Paul's signed-in blank Google Sheet confirmed. Read-only XLSX export inspected; no source sheet edits or live integration enabled. Source SHA256 a1aa9b0567daaa7c2c280f154aaaffad503cdbc810ff8ee9b0fac6bc212fe2cf.
- Added default Quote Builder grid matching A–X columns, yellow inputs, dark headers, frozen item names, distinct computed/override/final price, budgets, totals and economics. Grid edits use existing nullable overrides and append-only save flow. Existing tab workflows remain available.
- Blank creation now uses its own extracted settings, 699 catalog entries, 15 item rows, seven named spares and 15 service rows. Rates match the previous engine assumptions; estimates/overrides start empty or zero. Service estimator links initialized. Fonroche sample button removed from new-quote UI; historical snapshots/fixtures retained. No migration or hosted data writes.
- Dependencies installed using npm ci and the existing unchanged lockfile. Full TypeScript and Next.js build pass (dummy lab-format keys for build only). 37 tests pass: 32 calculator/estimator/safety + two validation + three blank-template tests. Initial combined tsx/mjs test invocation used the wrong loader; reran each suite with its documented loader successfully.
- Browser verification of actual editor in isolated local harness: blank start, material/hour edits ($440.84 including automatic PM), zero price override, restore, save/reload, takeoff quantity/cost/hour ($714.82 after second item), restore calculated takeoff cost, and second save/reload pass. API/auth/storage are replaced by a browser-local test adapter; this is not hosted persistence evidence. Desktop scrolling checked and corrected; mobile and real-session hosted acceptance remain outstanding.
- GitHub read succeeds; push dry-run fails with missing HTTPS authentication (could not read Username; terminal prompts disabled). No push or deployment occurred. Need Git authentication for meccajoe/mdp-tracker-lab, then push and verify Vercel source SHA/READY and Paul's real edit/save/reopen.
- Temporary local preview: http://127.0.0.1:4173, server/harness under /private/tmp/mdp-quote-preview. Test saves are browser-local, not lab quotes. Preview runtime is temporary; restart requires the recorded bundled Node executable. No real environment keys were loaded.

## Blank-template layout request — September 29, 2026
- Paul selected spreadsheet-style layout as the first change and supplied the blank Google Sheets template (linked in WORKING_BRIEF.md), explicitly replacing Fonroche sample data as the reference for this work.
- Direct web read failed; browser navigation reached Google sign-in. Template layout/formulas have not yet been inspected. Browser sheet opened for user sign-in; an uploaded XLSX is another way to supply the reference.
- No product implementation, pricing changes, quote data writes, commit or deployment performed for this request yet. Resume with template inspection, then implement a focused layout/blank-start change and verify the authorized test/push/deploy loop.

## Paul's local setup check — September 29, 2026
- Read AGENTS.md, this status, WORKING_BRIEF.md and V27_CALCULATOR.md before changes. Paul will choose one small workflow change for the first edit/test/push/deploy acceptance loop; no product or pricing changes made during setup inspection.
- Checkout was clean on main at 70c0b44; GitHub read access verified and remote HEAD matches. Git author configured. Push permission and current Vercel deployment status remain unverified.
- Bundled Node v24.19.0 runs all 32 calculator, estimator and lab-safety tests successfully, including Fonroche regression expectations.
- No local node_modules, actual environment file or .vercel project link present; node/npm/gh/vercel are not on the shell PATH. Bundled Node is available by absolute path. Full app checks require installing existing locked dependencies; real local service tests require lab-only configuration. No credentials read or changed.
- Existing notes document Git-triggered deployment to mdp-tracker-lab; no direct Vercel connector is available in this session. Verify deployment access and exact source SHA when shipping the chosen change. Paul's real login, workspace authorization and hosted save/reopen remain unverified.
- Preserve saved quotes/revisions and separate calculated values from overrides. Keep Fonroche as the pricing baseline unless Paul explicitly approves a rule change; Joe retains production promotion ownership.

## Confirmed
- Private repository: meccajoe/mdp-tracker-lab.
- Sanitized bootstrap main verified at f493458f3a72b27500d10c2670bdf009efee4646.
- Supabase project gkvaeqlqrthztobxitvn exists in Mecca Design & Production; schema bootstrap and hosted corrections are applied. Before hardening, hosted parity was 1,722 signatures with zero differences and 75 tables reported zero rows. Subsequent lab-only hardening intentionally changes two view options and nine function search paths.
- Original source baseline and sanitation details: LAB_BOOTSTRAP_PROVENANCE.md.
- Vercel cron schedules removed from lab configuration.
- Lab environment example contains no external integration credentials.
- Paul's email added to the quote product allowlist; this does not create an auth user or grant workspace membership.
- Production `public` schema exported without data through catalog queries forced read-only, security-reviewed, and restored into disposable PostgreSQL 17.
- Reviewed bootstrap, repeatable exporter/verifier, and 1,722-signature source/local parity check are recorded in `supabase/bootstrap/20260925_production_public_schema.sql`, `scripts/lab/`, `tools/lab/`, and `docs/lab/SCHEMA_BOOTSTRAP_REVIEW.md`.

## Next work
1. Dedicated Vercel project created and first deployment READY; finish live authentication and authorization verification.
2. Configure authentication and verify Joe/Paul login and workspace permissions.
3. Review inherited view/function exposure and verify real auth/RLS behavior before loading samples or opening access.
4. Load approved sample data, then reproduce Fonroche.
5. Configure Paul's Codex workspace when his GitHub username is available.

## Latest implementation checks
- Added strict lab URL and legacy JWT project/role checks at Next configuration load and API/auth request handling.
- Reject known external integration environment variables and block known integration API paths.
- Restricted browser connection destinations, removed production CORS settings, added noindex and a sandbox banner.
- Login redirects to the current origin instead of a production hostname.
- Nine focused Node tests, TypeScript, and a clean placeholder production build pass. Real lab connectivity, authentication, RLS behavior, and browser verification remain pending approved lab credentials/users.
- Schema-only bootstrap procedure: docs/lab/DATABASE_BOOTSTRAP.md.
- PostgreSQL 17 schema verification: 75 tables, 3 views, 1 sequence, 54 functions, 60 policies, 44 non-internal triggers, 316 PK/FK/unique/check/exclusion constraints, 1 explicit constraint trigger, 75 RLS-enabled tables, zero invalid constraints, and zero business rows.
- Semantic parity passes with 1,722 source and 1,722 local signatures, zero missing and zero extra, including column nullability/defaults, sequences/options/ownership, constraints, functions, triggers, views, RLS, and effective grants/grant options.
- Bootstrap review found no credential-shaped literals, hardcoded endpoints, outbound database calls, cron jobs, vault references, or foreign servers. Production grants and 30 `SECURITY DEFINER` functions are preserved and documented for pre-deployment review.
- Local verification uses auth schema stubs only because Docker Desktop remained unresponsive. Authentication and runtime RLS behavior are explicitly not verified.
- App checks: lab safety 9/9, TypeScript pass, clean placeholder build pass. Direct ESLint reports 150 existing errors and 16 warnings; the configured `next lint` command is obsolete under Next.js 16.

## Not yet ready
Hosted database bootstrap is complete; see docs/lab/HOSTED_BOOTSTRAP_VERIFICATION.md. First application deployment is READY. Auth-user creation, successful login, live data refresh, and completed quote implementation remain unverified/not completed.
The original production credential reported by Hermes has not been rotated as part of this task. Coordinate that separately.

## Session reporting
Update this file with completed changes, validation evidence, current blockers, and the next concrete task. Keep business decisions in the working brief.

## Hosted hardening — September 25, 2026
- Applied `lab_harden_view_and_function_resolution` only to gkvaeqlqrthztobxitvn; replay SQL: `supabase/bootstrap/lab_view_function_hardening.sql`.
- All three public views now use security_invoker=true. Nine previously mutable function search paths are pinned to pg_catalog, public, pg_temp. Client roles cannot CREATE in public.
- Catalog verification and pure-function smoke checks passed. Security advisors no longer report security_definer_view or function_search_path_mutable.
- Remaining advisors: 20 RLS-enabled tables without client policies, two anon-executable and 20 authenticated-executable SECURITY DEFINER functions. These remain review items, not a clean security certification.
- Attempted authenticated role probe was denied by the management connection; no role grants were changed to bypass this. Real JWT/RLS and browser tests remain pending.
- Vercel project creation/environment configuration are unavailable in the exposed connector. Automatic approval review rejected an unparameterized deployment because its destination was not established. No deployment occurred. Browser fallback requires user approval; exact proposed setup is in docs/lab/DEPLOYMENT_SETUP.md.

## First Vercel deployment — September 25, 2026
- Project mdp-tracker-lab: prj_H6frjmh8wPjYXFzK4aBHRjd7VhmF, team team_EEoCcHOGaLxcpWCZACyMGC54.
- Deployment dpl_DPYGEKoSDtjS4WvD8Xs6kwU9iue8 is READY; source main at 20af07ac792b386c51e63e429555d604f52cce15, Next.js 16.1.6, Node 24.x. Build/deployment took about 3 minutes.
- Verified browser URL: https://mdp-tracker-lab-meccanics.vercel.app/login. Root redirects signed-out visitor to login; sandbox banner visible.
- Exactly NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY saved for Production and Preview; no shared team variables linked. User entered server key directly in Vercel; value was not read or printed.
- Google sign-in transition was rejected by cloud browser URL policy; no attempt to bypass. Direct API guard navigation returned ERR_BLOCKED_BY_CLIENT. Neither test is claimed successful.
- Remaining: verify/configure lab Google provider and redirects, real JWT/RLS and workspace permissions, server-side database access, then seed samples and onboard Paul. No production resources changed.
- The earlier Vercel connector blocker was resolved through user-approved browser setup. This documentation commit may trigger a subsequent Git deployment; the READY evidence above applies to the specified source SHA.


## v27 calculation foundation — September 29, 2026
- Implemented a pure workbook calculation engine, reproducible Fonroche fixture, and 13 passing calculation/acceptance tests. See docs/lab/V27_CALCULATOR.md. All 18 populated workbook line outputs match, including $28,953.192 sell and $11,890.64 build budget.
- Strict standalone TypeScript 6.0.2 check passed for the new engine; 7 changed files scanned without credential-shaped values. Full application build and browser checks were not run for this unconnected module.
- Explicitly preserved the $1,250 PM fee override discovered in Fonroche N36; the template-calculated fee remains independently available.
- Snapshot includes 698 cached catalog entries, stable material/line/trade IDs, versioned assumptions, nullable overrides, and trade-hour reconciliation warnings. No live catalog connection was enabled.
- This is a calculation foundation only. Editor integration, hosted versioned persistence, browser save/reopen, upstream estimator editing, and capacity are not yet implemented or verified. No database migration or business-data writes in this slice.
- Authentication follow-up from September 26–28: primary lab URL is https://mdp-tracker-lab.vercel.app/login. The older meccanics deployment alias can require Vercel authentication and should not be used for user onboarding. Google provider and redirects were configured; Joe's auth identity and create_workspace capability were observed. At the last membership check Joe had zero active workspaces. Paul login and workspace authorization remain unverified.
- Next concrete task: connect a versioned, membership-authorized quote editor and verify quantity/cost/labor/override edits across a real hosted save/reopen.

## Workbook editor and revision saving — September 29, 2026 UTC
- Quote builder is the default view in each quote workspace. Added editable takeoffs/catalog selection, costs, quantities, section counts, trades, input/price overrides and restore controls, rate card, client quote and production budget previews, revision history, and unsaved-edit/download handling.
- New authenticated workbook API uses existing workspace access helpers, validates snapshots, and recalculates server-side. Saved workbook drafts are separate from governed commercial revisions.
- Applied only lab_quote_workbook_revisions to gkvaeqlqrthztobxitvn. Hosted catalog confirms RLS/two policies and denied anonymous read, authenticated update/delete. Invoker-only append sequencing rejects stale saves; no new security-advisor finding refers to the added objects. No production changes or hosted business-data writes.
- Verification: 13 calculator tests, 2 validation tests, disposable PostgreSQL RLS/history suite, strict component/API TypeScript, and local editor → API → PostgreSQL → reopen interaction loop passed. The latter stubs authentication and Next response plumbing, not workbook logic or persistence. Tested quantity, cost, labor, override edits/restoration, conflict 409, malformed 400, both previews.
- Runtime template removes one unused blank-name catalog entry; 697 usable items, no changes to Fonroche totals.
- Visual/real-session acceptance remains blocked: local Chromium download was unusable, cloud browser is signed out, and lab currently has no quote workspaces. Do not claim hosted save/reopen has passed. Source commit will trigger the lab Vercel build; deployment status must be checked separately.
- Next user-visible acceptance: sign in, create Fonroche comparison in Quotes, load Fonroche, save, edit, save and reload. Next engineering scope: full upstream estimators, then reconciled capacity.

## Linked estimator update — September 29, 2026 UTC
- Previous editor deployment 1b2bf92 / dpl_EJyXKrYiFV6XX4wTbbejUApxESwE verified READY on the primary lab URL. Google sign-in handoff was declined; no real-session save/reopen claim.
- Added editable Install, Travel, Shipping and beMatrix panels with calculated outputs, typed destination links, frozen-snapshot compatibility and persistent estimator inputs. No new DB migration or access changes.
- Source distinctions and intentional invalid-input guards documented in V27_CALCULATOR.md. New sample still matches every cached Fonroche line, $28,953.192 sell and $11,890.64 build budget.
- Verification: 13 existing calculator tests, 2 request validation tests, 10 estimator tests, strict component/API TypeScript, and local UI/API/PostgreSQL save/reopen (all four panels) passed. Local browser binaries remain unavailable; real-session and visual/mobile QA remain outstanding.
- Next engineering slice: reconcile trade/allowed hours into capacity and preserve demand across partial weeks, scenario status changes and committed work. Do not silently resolve the calendar-day versus workday allocation decision without Paul.

## Quote route authentication fix — September 29, 2026
- Joe reported /quotes returned 404. Both quote pages ran a cookie-only server-page access check before the browser session could supply its bearer token. The browser client stores its session locally.
- Removed the premature server-page check from the two data-free page shells. Existing AuthGuard, QuoteAccessGate, and all authenticated API/workspace/RLS checks remain in place. No data is loaded by the page shells.
- Both changed TSX routes transpile. Hosted deployment verification follows; signed-in user acceptance remains pending.
