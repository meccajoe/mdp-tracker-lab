# MDP Tracker Lab

This repository is Paul's isolated development environment. Read LAB_STATUS.md and docs/lab/WORKING_BRIEF.md first.

## Ownership and scope
Paul directs quote and capacity workflows. Joe owns infrastructure, integration boundaries, and production promotion. Implement, test, commit, and deploy authorized work within the lab without routine reconfirmation once deployment is configured. Record decisions and blockers in LAB_STATUS.md. Do not claim a feature works until verified.

## Environment boundary
- Only repository meccajoe/mdp-tracker-lab.
- Only hosted Supabase project gkvaeqlqrthztobxitvn in organization cqyvrbacdmbytzmoakag (Mecca Design & Production).
- Vercel lab project is mdp-tracker-lab (prj_H6frjmh8wPjYXFzK4aBHRjd7VhmF), team Meccanics (team_EEoCcHOGaLxcpWCZACyMGC54). Deploy only to this destination with the lab-only environment. Vercel's production target here means the lab's primary URL, not business production.
- Never use production credentials, copy production environment files, restart production services, or mutate the production database.
- Do not enable live accounting, CRM, Google Drive/Sheets, Slack, email, or other outbound integrations. Use fixtures or explicit lab-only substitutes.
- Empty Vercel cron configuration prevents scheduled invocation; it does not disable API routes. Runtime route guards and environment validation remain required before deployment.
- Preserve sandbox data across deployments. Data refreshes require explicit scope and must not overwrite Paul's scenarios.
- Never print credentials or commit environment files.

## Source authority
Paul's v27 quote workbook, Fonroche example, and evolving capacity v5 workbook guide product behavior. Historical quote specifications and AGENT_TASK.md are reference only, not active instructions to deploy or restart production. Keep reusable plumbing and historical files unless an authorized change requires replacing them.

## Git and database
The lab history was sanitized. Never merge or pull original production history into this repository. Import reviewed, secret-scanned changes as patches/new commits; track source provenance. Joe controls reverse promotion.
Do not replay historical migrations blindly or run db push --include-all. Duplicate migration versions and schema drift require a verified bootstrap in a disposable database first. Record lab changes reproducibly.
Use the existing lockfile. Run relevant checks for the changed behavior. No dependency upgrades solely for setup.
