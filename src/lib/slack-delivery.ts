const SLACK_BOT_TOKEN = process.env.MDP_SLACK_BOT_TOKEN;

export type SlackMessageBlock = Record<string, unknown>;

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

function buildSlackRequestBody(body: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue;
    if (typeof value === "string") {
      params.set(key, value);
      continue;
    }
    params.set(key, JSON.stringify(value));
  }
  return params;
}

async function slackApi(path: string, body: Record<string, unknown>) {
  if (!SLACK_BOT_TOKEN) {
    throw new Error("MDP_SLACK_BOT_TOKEN is not configured");
  }

  const response = await fetch(`https://slack.com/api/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: buildSlackRequestBody(body).toString(),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || data.ok !== true) {
    throw new Error(String(data.error ?? `Slack API ${path} failed`));
  }
  return data;
}

export async function lookupSlackUserByEmail(email: string) {
  let data: Record<string, unknown>;
  try {
    data = await slackApi("users.lookupByEmail", { email });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "users_not_found") {
      throw new Error(`No Slack user found for ${email}`);
    }
    throw error;
  }
  const user = data.user as { id?: string } | undefined;
  if (!user?.id) {
    throw new Error(`No Slack user found for ${email}`);
  }
  return user.id;
}

export async function lookupSlackEmailByUserId(userId: string) {
  const data = await slackApi("users.info", { user: userId });
  const user = data.user as { profile?: { email?: string } } | undefined;
  return user?.profile?.email?.toLowerCase() ?? null;
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

export async function sendSlackChannelMessage(args: {
  channel: string;
  text: string;
  threadTs?: string | null;
  blocks?: SlackMessageBlock[];
}) {
  const data = await slackApi("chat.postMessage", {
    channel: args.channel,
    text: args.text,
    thread_ts: args.threadTs ?? undefined,
    blocks: args.blocks,
  });
  return (data.ts as string | undefined) ?? null;
}

export async function sendSlackDmByEmail(email: string, text: string) {
  const userId = await lookupSlackUserByEmail(email);
  const channelId = await openSlackDmChannel(userId);
  const ts = await sendSlackMessage(channelId, text);
  return { userId, channelId, ts };
}

export default {
  buildSlackTestMessage,
  lookupSlackEmailByUserId,
  lookupSlackUserByEmail,
  openSlackDmChannel,
  sendSlackChannelMessage,
  sendSlackDmByEmail,
  sendSlackMessage,
};
