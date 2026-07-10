import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { fetchProjectCopilotContext } from "@/lib/project-copilot-context";
import { listSlackDmSubscriptionsForProject, updateSlackDmSubscriptionStatus } from "@/lib/project-subscription-store";
import {
  buildSlackProjectHelpText,
  buildSlackProjectResponse,
  buildSlackSubscriptionListResponse,
  parseSlackProjectCommand,
  stripSlackBotMention,
} from "@/lib/slack-project-copilot";
import { lookupSlackEmailByUserId, sendSlackChannelMessage } from "@/lib/slack-delivery";
import { verifySlackRequest } from "@/lib/slack-request";
import { findSlackThreadBinding, upsertSlackThreadBinding } from "@/lib/slack-thread-bindings";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MDP_SLACK_SIGNING_SECRET = process.env.MDP_SLACK_SIGNING_SECRET;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function lookupCreatorEmail(slackUserId: string | null) {
  if (!slackUserId) return null;
  try {
    return await lookupSlackEmailByUserId(slackUserId);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const body = JSON.parse(rawBody) as {
    type?: string;
    challenge?: string;
    team_id?: string;
    event?: {
      type?: string;
      text?: string;
      channel?: string;
      thread_ts?: string;
      ts?: string;
      user?: string;
      bot_id?: string;
      subtype?: string;
    };
  };

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge ?? "" });
  }

  const isValid = verifySlackRequest({
    rawBody,
    signature: request.headers.get("x-slack-signature"),
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signingSecret: MDP_SLACK_SIGNING_SECRET,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  if (body.type !== "event_callback" || body.event?.type !== "app_mention" || !body.event.channel || !body.event.text) {
    return NextResponse.json({ ok: true });
  }

  if (body.event.bot_id || body.event.subtype === "bot_message") {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseSlackProjectCommand(stripSlackBotMention(body.event.text));
  if ("error" in parsed) {
    await sendSlackChannelMessage({
      channel: body.event.channel,
      threadTs: body.event.thread_ts ?? body.event.ts,
      text: parsed.error,
    });
    return NextResponse.json({ ok: true });
  }

  const supabase = getSupabaseAdmin();
  const threadTs = body.event.thread_ts ?? body.event.ts;
  const slackUserId = body.event.user ?? null;
  const creatorEmail = await lookupCreatorEmail(slackUserId);

  let projectId = parsed.projectId;
  if (!projectId && body.team_id && threadTs) {
    const binding = await findSlackThreadBinding({
      supabase,
      slackTeamId: body.team_id,
      channelId: body.event.channel,
      threadTs,
    });

    if (binding.error) {
      await sendSlackChannelMessage({
        channel: body.event.channel,
        threadTs,
        text: binding.error,
      });
      return NextResponse.json({ ok: true });
    }

    projectId = binding.data?.project_id ?? null;
  }

  if (!projectId) {
    await sendSlackChannelMessage({
      channel: body.event.channel,
      threadTs,
      text: `This thread isn’t bound to a project yet. Start with a job number, like "/project 26144 summary" or "@bot 26144 summary".`,
    });
    return NextResponse.json({ ok: true });
  }

  const context = await fetchProjectCopilotContext(supabase, projectId);
  if (context.error || !context.data) {
    await sendSlackChannelMessage({
      channel: body.event.channel,
      threadTs,
      text: context.error === "Project not found"
        ? `I couldn’t find project ${projectId}. ${buildSlackProjectHelpText()}`
        : (context.error ?? "Failed to load project context"),
    });
    return NextResponse.json({ ok: true });
  }

  if (body.team_id && threadTs && parsed.explicitProject) {
    await upsertSlackThreadBinding({
      supabase,
      slackTeamId: body.team_id,
      channelId: body.event.channel,
      threadTs,
      projectId,
      createdBySlackUserId: slackUserId,
    });
  }

  if (parsed.intent === "subscriptions") {
    if (!slackUserId) {
      await sendSlackChannelMessage({ channel: body.event.channel, threadTs, text: "Missing Slack user context." });
      return NextResponse.json({ ok: true });
    }

    const result = await listSlackDmSubscriptionsForProject({
      supabase,
      projectId,
      slackUserId,
      createdByEmail: creatorEmail,
    });

    const response = result.error
      ? { text: result.error }
      : buildSlackSubscriptionListResponse({
          projectId,
          projectName: context.data.project.name,
          subscriptions: result.data ?? [],
        });

    await sendSlackChannelMessage({
      channel: body.event.channel,
      threadTs,
      text: response.text,
      blocks: "blocks" in response ? response.blocks : undefined,
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.intent === "pause" || parsed.intent === "resume" || parsed.intent === "delete") {
    if (!slackUserId || !parsed.subscriptionId) {
      await sendSlackChannelMessage({ channel: body.event.channel, threadTs, text: "Missing Slack user or subscription id." });
      return NextResponse.json({ ok: true });
    }

    const updated = await updateSlackDmSubscriptionStatus({
      supabase,
      projectId,
      subscriptionId: parsed.subscriptionId,
      action: parsed.intent,
      slackUserId,
      createdByEmail: creatorEmail,
    });

    if (updated.error) {
      await sendSlackChannelMessage({ channel: body.event.channel, threadTs, text: updated.error });
      return NextResponse.json({ ok: true });
    }

    const result = await listSlackDmSubscriptionsForProject({
      supabase,
      projectId,
      slackUserId,
      createdByEmail: creatorEmail,
    });

    const response = result.error
      ? { text: result.error }
      : buildSlackSubscriptionListResponse({
          projectId,
          projectName: context.data.project.name,
          subscriptions: result.data ?? [],
        });

    await sendSlackChannelMessage({
      channel: body.event.channel,
      threadTs,
      text: response.text,
      blocks: "blocks" in response ? response.blocks : undefined,
    });
    return NextResponse.json({ ok: true });
  }

  const response = buildSlackProjectResponse({
    command: { ...parsed, projectId },
    project: context.data.project,
    categoryActuals: context.data.categoryActuals,
  });

  await sendSlackChannelMessage({
    channel: body.event.channel,
    threadTs,
    text: response.text,
    blocks: response.blocks,
  });

  return NextResponse.json({ ok: true });
}
