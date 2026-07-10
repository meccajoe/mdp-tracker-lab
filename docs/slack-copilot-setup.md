# Slack Copilot Setup

This repo now exposes three Slack endpoints:

- slash command: `/api/slack/commands/project`
- interactivity: `/api/slack/actions`
- events API: `/api/slack/events`

## What works today

From any Slack channel where the bot is present:

- `/project 26144 summary`
- `/project 26144 budget`
- `/project 26144 labor`
- `/project 26144 notify labor too high`
- `/project 26144 subscriptions`
- `/project 26144 pause <subscription-id>`
- `/project 26144 resume <subscription-id>`
- `/project 26144 delete <subscription-id>`
- `@bot 26144 summary`
- `@bot 26144 notify labor too high`

Created alert subscriptions default to **Slack DM delivery to the creator**.

## Required env vars

Add these to `.env.local` and production:

- `MDP_SLACK_BOT_TOKEN`
- `MDP_SLACK_SIGNING_SECRET`

Optional for schema rollout script:

- `SUPABASE_DB_URL` **or**
- `SUPABASE_DB_PASSWORD`

## Slack app wiring

Import `slack/app-manifest.example.yaml` or copy its settings into the Slack app manually.

For the exact admin click-path and post-install checklist, see:

- `docs/slack-app-admin-checklist.md`

### Required bot scopes

These were chosen to match the current implementation:

- `app_mentions:read`
- `chat:write`
- `commands`
- `im:write`
- `users:read`
- `users:read.email`

Why:

- `chat.postMessage` requires `chat:write`
- `users.lookupByEmail` requires `users:read.email`
- `users.info` uses `users:read`, and Slack documents that access to the email field also requires `users:read.email`
- `conversations.open` is used for DM delivery
- `app_mention` events require `app_mentions:read`
- slash commands require `commands`

## Schema rollout

The code is ready, but live rollout still depends on getting these migrations into the remote database:

- `supabase/migrations/20260710143000_project_subscriptions.sql`
- `supabase/migrations/20260710190000_project_conversation_threads.sql`

### Preferred rollout command

```bash
cd /Users/archie/projects/mdp-tracker
bash scripts/apply-slack-copilot-remote.sh
```

The script:

1. applies both SQL files directly
2. repairs migration history to `applied`
3. verifies both tables exist
4. verifies both versions are present in `supabase_migrations.schema_migrations`

### Credential modes

Use one of these:

#### Option A — direct DB URL

```bash
export SUPABASE_DB_URL='postgresql://...'
bash scripts/apply-slack-copilot-remote.sh
```

This does **not** require Supabase CLI profile login.

#### Option B — linked project + DB password

```bash
export SUPABASE_DB_PASSWORD='...'
bash scripts/apply-slack-copilot-remote.sh
```

This uses the linked project ref already stored in `supabase/.temp/project-ref`.

## Slack install order

Use this order to avoid partial setup confusion:

1. complete the remote schema rollout
2. import/apply the Slack manifest
3. install or reinstall the Slack app to the workspace
4. set `MDP_SLACK_BOT_TOKEN` and `MDP_SLACK_SIGNING_SECRET` in production
5. restart the app process
6. invite the bot into at least one public test channel and one private test channel if needed
7. run the smoke tests below

## Post-rollout smoke test

After schema rollout and Slack app install:

1. run `/project 26144 summary` in a channel with the bot
2. run `/project 26144 notify labor too high`
3. click `Create alert (DM me)`
4. run `/project 26144 subscriptions`
5. pause/resume/delete one subscription
6. verify a follow-up in the same thread works without repeating the job number once thread binding has been created

## Automatic evaluator route

The repo now includes an evaluator route that scans active project subscriptions, decides which ones should fire, and delivers Slack DMs when appropriate:

- route: `/api/cron/evaluate-project-subscriptions`
- auth: `Authorization: Bearer $CRON_SECRET`

Useful query params:

- `dryRun=1` → evaluate without writing runs or sending DMs
- `force=1` → force scheduled digests for testing even outside the normal 4pm weekday window
- `projectId=26144` → limit evaluation to one project
- `subscriptionId=<uuid>` → limit evaluation to one subscription

Current behavior:

- threshold alerts fire on threshold crossings, not every poll while already above threshold
- weekday digest schedule is interpreted in `America/Chicago`
- Slack DM delivery is supported for subscriptions with a stored Slack user id or resolvable creator email
- the route records runs/deliveries when not in dry-run mode

## Known remaining gaps

- evaluator route exists, but non-Vercel deployments still need an external cron or scheduler to call it
- no email delivery yet
- slash-command responses are ephemeral; app mention replies are threaded
- thread binding works only after the backing table exists remotely
