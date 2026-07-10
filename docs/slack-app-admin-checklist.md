# Slack App Admin Checklist

Use this after the database schema rollout is already complete.

## 1. Set production env vars

On the host running MDP Tracker, set:

- `MDP_SLACK_BOT_TOKEN`
- `MDP_SLACK_SIGNING_SECRET`

Then restart the app process.

## 2. Create or update the Slack app from the manifest

Preferred path:

1. Go to Slack API → **Your Apps**
2. Choose the workspace where MDP Tracker should live
3. Create a new app **from manifest** or update the existing app manually
4. Paste/import `slack/app-manifest.example.yaml`

If updating manually instead of importing, copy over:

- slash command `/project`
- interactivity request URL
- events request URL
- bot scopes
- `app_mention` bot event

## 3. Install or reinstall the app

After scopes or manifest settings change:

1. Open **Install App** in Slack app settings
2. Click **Install to Workspace** or **Reinstall to Workspace**
3. Approve the requested scopes

## 4. Copy secrets back into MDP Tracker

From the Slack app settings:

- **OAuth & Permissions** → Bot User OAuth Token → set as `MDP_SLACK_BOT_TOKEN`
- **Basic Information** → App Credentials → Signing Secret → set as `MDP_SLACK_SIGNING_SECRET`

Restart the MDP Tracker process after saving both values.

## 5. Invite the bot into test channels

The bot can only respond in channels where it is present.

For public channels:

```text
/invite @MDP Project Copilot
```

For private channels, invite it explicitly the same way from inside the private channel.

## 6. Smoke test from Slack

Run these in a channel where the bot is present:

```text
/project 26144 summary
/project 26144 notify labor too high
/project 26144 subscriptions
```

Then test an app mention:

```text
@MDP Project Copilot 26144 summary
```

Expected behavior:

- slash command replies are ephemeral
- app mention replies land in-thread
- creating an alert defaults delivery to a DM to the creating user

## 7. Channel + thread behavior to confirm

After an explicit project anchor in a thread, try follow-ups like:

```text
subscriptions
pause <subscription-id>
resume <subscription-id>
```

If that fails, verify:

- the app was reinstalled after scope changes
- the bot is in the channel
- `project_conversation_threads` exists remotely
- `MDP_SLACK_BOT_TOKEN` / `MDP_SLACK_SIGNING_SECRET` are current in production

## 8. Known current limitations

- no automatic alert evaluator yet
- no email delivery yet
- slash command responses are ephemeral by design for now
- DM delivery depends on the Slack user email lookup working inside the workspace
