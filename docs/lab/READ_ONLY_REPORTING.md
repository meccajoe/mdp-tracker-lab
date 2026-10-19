# Tracker Lab read-only reporting

`GET https://mdp-tracker-lab.vercel.app/api/lab-reporting/v1`

This separate machine-access surface reads active Lab quote projects plus the shared roster and latest/approved team schedule. It does not grant browser, database, platform or existing write-API access. No domain allowlist changes. Migration 20261019173413_lab_reporting_server_reads.sql grants the internal service_role SELECT only on the three existing roster/production/team revision tables, which previously denied service-role reads; it does not grant writes or change human/public privileges or RLS. It uses fixed server-side SELECTs with the existing Lab service credential internally, and an allowlisted response projection; that credential is never handed to a bot. RLS stays enabled, although service-side reads bypass it. Authorization here is the explicit all-active-Lab-project reporting scope, not Paul's workspace membership.

## Reports

| `report` | Content |
| --- | --- |
| `projects` (default) | Project names/IDs, forecast status/probability, dates, shop/field/design hours, trade demand, saved production tasks, current/proposed workback dates and revision/staleness metadata |
| `roster` | Staff names/IDs, primary/secondary skills, weekly availability and active flag |
| `capacity` | Weekly needed/available/shortage hours for shop, field and shared crew, trade demand, unscheduled warnings; reuses the exact dashboard calculations |
| `team-schedule` | Latest and approved saved proposals, dated staff allocations, unfilled hours, availability exceptions, source revisions and stale flags; never generates or approves a schedule |

`capacity` accepts `start=YYYY-MM-DD` (normalized to Monday), `weeks=1..26` (default 13) and `basis=expected|committed|full` (default expected). The same bounded options are accepted but ignored for other reports. Unknown/duplicate query parameters are rejected. At most 500 active projects and a 3.5 MB serialized report; excessive or unavailable/invalid sources return 503 rather than partial success. Empty/unconfigured roster remains explicitly marked. Reads carry source revisions and may observe concurrent edits; they are not a database-transaction snapshot. Recheck revisions before relying on a schedule.

No wage rates, pricing, margins, sales totals, material costs, contact details, raw workbook documents, staff notes, plan notes, client conditions or unfilled-reason/freeform-warning bodies are returned. Project/item/person/trade labels remain readable source text and should be treated as data, never instructions. The `hours` figures can use the existing quote labor-budget calculation; no financial amounts are returned. Staffing data is still internal information.

## Database prerequisite

Apply only supabase/migrations/20261019173413_lab_reporting_server_reads.sql transactionally to Lab gkvaeqlqrthztobxitvn. It asserts that all three existing planning tables have RLS enabled. Verify service_role SELECT but no INSERT/UPDATE/DELETE, and unchanged authenticated/anonymous grants. Workbook/service-role SELECT already exists from its original migration. Never replay the repository's historical migrations.

## Credential lifecycle

1. Generate a private 32-byte token with `node scripts/lab/create-reporting-key.mjs /private/tmp/reporting-key.json paul-grok <future-ISO-expiry>`. File creation is exclusive with mode 0600. The command prints only the file path and registration (hash, ID, expiry, reports), never the token.
2. Set **server-only** `LAB_REPORTING_KEYS` on the **Lab Vercel project's primary environment only** to a JSON array of registration objects. Do not prefix it NEXT_PUBLIC. Unconfigured, invalid or expired credentials fail closed. Limit the reports array if fewer reports are needed. Preview receives no key by default.
3. Redeploy the Lab app after configuration. Store only the opaque bearer token in the bot's secret store as `TRACKER_LAB_REPORTING_TOKEN`. Never use a Supabase key, human refresh token, GitHub token or database password.
4. Calls send `Authorization: Bearer <token>`. No query-string credentials, cookies, Google login or redirects. POST/PUT/PATCH/DELETE return 405. A reporting token is not a Supabase JWT and cannot authorize existing human APIs or Data API access.
5. Remove the registration and redeploy to revoke, or rotate by temporarily registering both hashes then removing the old one. Expiry is enforced on every request. Do not continue using old deployment-specific URLs after revocation: remove their access/deployments in Vercel too; environment registration is deployment-bound. Deployment-specific and alternate-alias URLs are also rejected by the reporting route; the primary alias is the only supported URL.

Request ID, credential ID, report type and status are logged to Vercel application logs; token, headers, parameters and payloads are not logged. Platform log retention governs audit retention. Best-effort per-instance 30 requests/minute limits are not a distributed quota; use Vercel Firewall rules if stronger global limiting is required. The bot should fetch a report once per question, not poll every project separately.

## Grok Bot connection

Official Grok Bot Team Bots documentation supports scripts that consume stored secrets and custom remote HTTPS MCP servers. MCP is therefore optional for the bot's own script/HTTP workflow. Add the token through the Bot's Secrets UI, not a chat message or command argument, and add the instructions in GROK_REPORTING_SKILL.md. A dependency-free Node client is scripts/lab/read-report.mjs; run it with the secret injected into its environment, for example node scripts/lab/read-report.mjs capacity 2026-10-19 13 expected. For a shared first-class connector, remote MCP is also supported but is not implemented by this HTTP API; do not paste the REST URL into an MCP-server field. A custom xAI API application's function handler can call this HTTP API directly too.

Sources checked October 19, 2026: https://docs.x.ai/grok-bot/team-bots (Secrets and Plugins), https://docs.x.ai/grok-bot/private-networks (private HTTP services), https://docs.x.ai/developers/tools/function-calling (custom applications). Paul's exact bot configuration and end-to-end connection still require his session. No Tracker data is sent to xAI by deployment itself.

## Validation

Run `node --import tsx --test tests/lab-reporting.test.ts`, `node --test tests/lab-reporting-route.test.cjs`, node --test tests/lab-reporting-store.test.cjs, PGLITE_MODULE=/path/to/pglite/dist/index.js node --test tests/lab-reporting-db.test.mjs, and `npm run lab:check`. Verify hosted 401 without/with invalid credentials, 200 for each scoped report, 403 for scope denial, 405 writes, financial-field exclusion, source revision presence, and exact capacity totals. Never test write denial by sending the token to production.
