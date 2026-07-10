const SLACK_BOT_TOKEN = process.env.MDP_SLACK_BOT_TOKEN;

export function buildSlackTestMessage(args: {
  projectId: string;
  projectName: string;
  summaryText: string;
  recommendationMessage?: string | null;
}) {
  return [
    `🔔 Project ${args.projectId} — ${args.projectName}`,
    args.summaryText,
    args.recommendationMessage ?? null,
  ].filter(Boolean).join("\n\n");
}

async function slackApi(path: string, body: Record<string, unknown>) {
  if (!SLACK_BOT_TOKEN) {
    throw new Error("MDP_SLACK_BOT_TOKEN is not configured");
  }

  const response = await fetch(`https://slack.com/api/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || data.ok !== true) {
    throw new Error(String(data.error ?? `Slack API ${path} failed`));
  }
  return data;
}

export async function lookupSlackUserByEmail(email: string) {
  const data = await slackApi("users.lookupByEmail", { email });
  const user = data.user as { id?: string } | undefined;
  if (!user?.id) {
    throw new Error(`No Slack user found for ${email}`);
  }
  return user.id;
}

export async function openSlackDmChannel(userId: string) {
  const data = await slackApi("conversations.open", { users: userId });
  const channel = data.channel as { id?: string } | undefined;
  if (!channel?.id) {
    throw new Error(`No DM channel returned for Slack user ${userId}`);
  }
  return channel.id;
}

export async function sendSlackMessage(channel: string, text: string) {
  const data = await slackApi("chat.postMessage", { channel, text });
  return (data.ts as string | undefined) ?? null;
}

export async function sendSlackDmByEmail(email: string, text: string) {
  const userId = await lookupSlackUserByEmail(email);
  const channelId = await openSlackDmChannel(userId);
  const ts = await sendSlackMessage(channelId, text);
  return { userId, channelId, ts };
}
