# Linked project identity and operational status

HubSpot is the one-way authority for the exact deal/project name and job number. The existing Lab project/deal link is the match key; never match by name or create a second project during refresh. Unlinked quotes retain their working names and an empty job number until their deal association is verified.

The Quotes and Capacity Projects lists show a searchable, sortable Job number column. Its link opens the existing Lab project. Current linked project names match HubSpot exactly; version identity remains the workspace UUID, group, creation date and saved revision. Original names are retained in lab_project_quote_sources.snapshot.original_workspace_titles; quote documents and pinned financial snapshots remain unchanged.

## Manual HubSpot refresh

An authorized Lab administrator who is a member of the source workspace can choose Refresh from HubSpot on the project or linked quote actions. The server reads only dealname and job_number from that project's bound deal with a GET to the fixed HubSpot API origin, rejects redirects, validates the response and calls a service-only atomic Lab identity function. It does not write to HubSpot, read financial values, create jobs or run downstream workflows. Exact punctuation and whitespace are retained. Conflicting job numbers and changed deal links fail without changing identity.

Before using the button, configure LAB_HUBSPOT_READ_TOKEN as a server-only sensitive environment variable in the mdp-tracker-lab Vercel project (prj_H6frjmh8wPjYXFzK4aBHRjd7VhmF), team Meccanics (team_EEoCcHOGaLxcpWCZACyMGC54). Provision a separate HubSpot credential with deal read access only; never copy the operational Tracker environment file or put a token in NEXT_PUBLIC variables, source control or chat. Deploy after configuring the setting. The setting was verified absent via CLI metadata on November 10; the refresh API therefore reports setup required until it is configured. No scheduled refresh is enabled: Joe selected Manual refresh first.

The initial twelve identity reads were performed read-only outside the hosted Lab and applied through the same guarded Lab database function. Receipts: /tmp/mdp-identity-verified-hubspot.json, /tmp/mdp-identity-initial-refresh.sql. No production or HubSpot writes.

## Operational project status

Quote project status owns the linked Lab project's operational status. The authoritative version is the newest-created non-archived workspace in the version group, matching the Quotes list grouping rule; it is independent of the older version optionally selected for capacity. Its latest saved workbook determines the state. Complete maps to Completed in the project's existing schema, Active to Active, and Not Active to Pending. Existing legacy Completed/In production forecasts and planning overrides retain the same precedence as projectStatusFor. Closed won is a sales state and is not rewritten when production completes.

Database triggers keep project records synchronized after workbook/status saves, group changes and archival. Same-project clones inherit identity; a separated quote drops its inherited job link. Joining two already-linked HubSpot jobs is rejected. Ordinary local renaming of linked projects/quotes is rejected, and the Quotes rename action is disabled for linked rows.

Authoritative projections execute only from private, non-client-callable trigger functions, after the original table RLS has authorized the edit. This prevents a user who sees an older version but not the newest one from overwriting the project's global state. No client can access the private projection schema, and the identity-write RPC is service-only. Financial baselines are untouched by operational status changes. Existing quote and capacity forecasting values remain independent.

## Verification

303 Lab regressions and TypeScript pass, including refresh authorization/provider validation and quote job-number search. The sanitized Node 24 webpack build passes. Disposable PostgreSQL tests verify canonical names, exact whitespace, immutable prices, duplicate-job/wrong-deal rejection, old-version precedence, completion/reopening, legacy/planning mapping, clone/split/conflicting jobs, archive fallback, authenticated trigger execution, rejected local identity overrides and partial RLS visibility.

Run tests/lab-project-sync.database.sql only in a fresh local database named mdp_lab_identity_test...; the script refuses other database names and creates fixture tables/functions. It applies both migrations in order. Example local invocation: psql -d mdp_lab_identity_test_example -f tests/lab-project-sync.database.sql, using the isolated fixture cluster's socket and role. Never replay it against hosted Lab.

Rendered fixture-browser checks (no personal account or live service) cover desktop/mobile, job search/link, protected rename, refresh setup error, horizontal scrolling and no JavaScript errors. Screenshots: /tmp/mdp-identity-quotes-desktop.png and /tmp/mdp-identity-quotes-mobile.png. Authenticated hosted UI acceptance and a live refresh with the new dedicated token remain pending. External vet was not run; local vet could not initialize its tokenizer, and the earlier network-review denial was respected.
