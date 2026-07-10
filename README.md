# MDP Tracker

MDP Tracker is the internal project-cost and project-operations app for Mecca Design & Production.

## Core stack

- Next.js app router
- Supabase (Postgres + Auth)
- HubSpot, QBO, BILL, Monday integrations
- Slack project copilot entrypoints for project Q&A and alert setup

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.local.example` to `.env.local` and fill in the values you need.

Key env vars for the current Slack copilot slice:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MDP_SLACK_BOT_TOKEN`
- `MDP_SLACK_SIGNING_SECRET`

## Slack copilot

Current routes:

- `/api/slack/commands/project`
- `/api/slack/actions`
- `/api/slack/events`

Current supported Slack flows:

- `/project <job-number> summary|budget|labor|notify ...`
- `/project <job-number> subscriptions`
- `/project <job-number> pause <subscription-id>`
- `/project <job-number> resume <subscription-id>`
- `/project <job-number> delete <subscription-id>`
- `@bot <job-number> ...` app mentions

Created alert subscriptions default to **Slack DM delivery to the creating user**.

See `docs/slack-copilot-setup.md` for:

- Slack app manifest wiring
- required scopes
- migration rollout steps
- remote schema repair script usage

## Schema rollout for Slack copilot

The current Slack slices depend on these migrations existing remotely:

- `supabase/migrations/20260710143000_project_subscriptions.sql`
- `supabase/migrations/20260710190000_project_conversation_threads.sql`

Preferred helper:

```bash
bash scripts/apply-slack-copilot-remote.sh
```

That helper applies both SQL files directly, repairs migration history, and verifies the resulting tables.
