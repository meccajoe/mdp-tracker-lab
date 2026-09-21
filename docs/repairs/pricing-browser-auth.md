# Pricing API browser authentication repair

Source baseline: Tracker 51d89de77c69b58e45b053488a03fd1a9cd41b86. Isolated source candidate only; no application deployment or SQL application performed.

The browser uses the existing Supabase JS session. The pricing API previously called requireProjectAdmin() without the incoming request, so only cookie authentication was available. A signed-in browser could load the direct database report while the API returned Authentication required. This is consistent with the observed production behavior; tokens/cookies were not extracted to diagnose it.

## Change

Pass the incoming request to the existing authorization gate. Connect the pricing report's read loader to this API through the existing authenticatedFetch helper. Keep server validation through Supabase getUser and user_roles admin authorization; preserve cookie callers. An invalid bearer cannot fall back to a valid cookie. No shared authentication helper, OAuth flow or role grants changed.

The report previously loaded every indexed project. Add bounded offset pagination to the API and load all pages in the browser (100 per page), with id as a deterministic sort tie breaker. Failed pages reject the entire load and clear previous report rows. Existing filters and the default 25/max 100 API limits remain. The existing project-type edit action is unchanged; do not exercise it during verification.

A direct address-bar request does not attach a local-storage bearer token. It can still return 401 when no server cookie session exists; it is not the acceptance test for this repair. Use the signed-in pricing page's actual API request instead. Do not copy tokens into chat, logs or command arguments.

## Tests

Run from the isolated checkout with installed baseline dependencies:

    node --test tests/pricing-browser-auth.test.cjs
    node --import tsx --test src/app/api/pricing-intelligence/projects/route.contract.test.ts
    node_modules/.bin/tsc --noEmit --incremental false
    git diff --check

Behavior tests execute the actual route, authorization gate, browser loader and existing authenticated-fetch implementation, replacing external Auth/database/fetch services only. They cover admin bearer, admin cookies, anonymous and non-admin refusal, invalid bearer with valid cookie, bounded pagination and filters, database failures, all-page loading and mid-load authentication failure. A source contract checks the React page connects the tested loader. These are not live JWT or deployed browser checks.

## Application release and verification (not executed)

Review and apply this commit to a release checkout of the exact baseline; if baseline has moved, rebase and review rather than force application. Deploy through the existing approved application release process only after explicit production deployment authorization. Do not deploy Workflow B or run migrations with this code release.

Before and after release, capture the signed-in dashboard and pricing report counts and a fixed representative row in protected evidence. After release, reload /admin/pricing-intelligence in the existing admin Chrome session. Confirm successful GET requests to /api/pricing-intelligence/projects?limit=100&offset=0 and subsequent pages in browser network inspection, without exporting authorization headers. Confirm complete row count and representative values against the baseline; no auth-error toast. Confirm signed-out requests return 401. Non-admin live verification remains the explicitly accepted exception; synthetic non-admin coverage must still pass.

Only then resume the separately approved security SQL procedure. Recheck SQL hash and every metadata guard and establish the remaining REST/JWT and database execution prerequisites. Do not treat these local tests as live postchecks. The protected mdp-approved libpq service is not configured, and the available SQL metadata connector reports supabase_read_only_user. Resolve that capability before application, without changing SQL guards or running a broad migration push.

Recovery: revert this application commit through the same release process if the new read path regresses. That restores the prior direct-report read and prior cookie-only API behavior. It does not reverse SQL containment or restore anonymous grants. Offset pagination is not a database snapshot; concurrent project edits can shift rows across requests, as with ordinary paginated reports.
