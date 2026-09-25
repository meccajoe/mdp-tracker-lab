# Lab status

## Confirmed
- Private repository: meccajoe/mdp-tracker-lab.
- Sanitized bootstrap main verified at f493458f3a72b27500d10c2670bdf009efee4646.
- Supabase project gkvaeqlqrthztobxitvn exists in Mecca Design & Production; public schema was empty at setup verification.
- Original source baseline and sanitation details: LAB_BOOTSTRAP_PROVENANCE.md.
- Vercel cron schedules removed from lab configuration.
- Lab environment example contains no external integration credentials.
- Paul's email added to the quote product allowlist; this does not create an auth user or grant workspace membership.

## Next work
1. Verify a reproducible database bootstrap using the actual schema and historical migration audit.
2. Add runtime isolation checks, block integration/cron entry points, and add a visible sandbox banner.
3. Create the dedicated Vercel project and configure only lab credentials.
4. Configure authentication and verify Joe/Paul login and workspace permissions.
5. Load approved sample data, then reproduce Fonroche.
6. Configure Paul's Codex workspace when his GitHub username is available.

## Not yet ready
No application deployment, database bootstrap, auth-user creation, live data refresh, or completed quote implementation is claimed.
The original production credential reported by Hermes has not been rotated as part of this task. Coordinate that separately.

## Session reporting
Update this file with completed changes, validation evidence, current blockers, and the next concrete task. Keep business decisions in the working brief.
