# Dedicated lab deployment setup

Target repository: `meccajoe/mdp-tracker-lab`, branch `main`.
Vercel team: Meccanics (`team_EEoCcHOGaLxcpWCZACyMGC54`).
Configured project: `mdp-tracker-lab` (`prj_H6frjmh8wPjYXFzK4aBHRjd7VhmF`). Do not reuse `mdp-tracker` or import its settings.
Framework: Next.js; root: repository root; install from existing lockfile; build: npm run build.

Configure only credentials obtained from Supabase project `gkvaeqlqrthztobxitvn`, organization `cqyvrbacdmbytzmoakag`:
- NEXT_PUBLIC_SUPABASE_URL=https://gkvaeqlqrthztobxitvn.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY: lab public key
- SUPABASE_SERVICE_ROLE_KEY: lab server-only key, never NEXT_PUBLIC
- If SUPABASE_URL is configured, use the same lab URL.

Check environment validation and the repository environment example before deployment. Do not copy production environment files or external integration credentials. No cron schedules. Configure preview and the lab project's primary deployment with lab-only credentials; the Vercel label 'production' must refer only to this separate lab project.

After project creation, record its exact project ID and deployment URL. Configure Supabase login redirects to that URL and configure the lab authentication provider securely. Keep registration/access restricted to intended users; the inherited authenticated table policies are broad and the application email allowlist is not a database authorization boundary.

Verify signed-out denial, actual Joe/Paul login, workspace permissions, blocked integrations, and save/reopen against the lab before loading samples or handing over. Review remaining SECURITY DEFINER exposure. Do not claim successful login from catalog checks.

Project creation and first deployment completed using user-approved browser access. First READY deployment: dpl_DPYGEKoSDtjS4WvD8Xs6kwU9iue8 at source 20af07ac792b386c51e63e429555d604f52cce15. Verified login page: https://mdp-tracker-lab-meccanics.vercel.app/login.

Authentication remains the next gate. Cloud browser URL policy blocked the Google transition and direct guard-route browsing; do not interpret those blocks as application responses. Verify lab provider/redirect configuration and actual login through an authorized supported path. No sample rows or user permissions were created during deployment.
