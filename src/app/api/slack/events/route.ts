import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { fetchProjectCopilotContext } from "@/lib/project-copilot-context";
import {
  buildSlackProjectHelpText,
  buildSlackProjectResponse,
  parseSlackProjectCommand,
  stripSlackBotMention,
} from "@/lib/slack-project-copilot";
import { sendSlackChannelMessage } from "@/lib/slack-delivery";
import { verifySlackRequest } from "@/lib/slack-request";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MDP_SLACK_SIGNING_SECRET = process.env.MDP_SLACK_SIGNING_SECRET;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const isValid = verifySlackRequest({
    rawBody,
    signature: request.headers.get("x-slack-signature"),
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signingSecret: MDP_SLACK_SIGNING_SECRET,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as {
    type?: string;
    challenge?: string;
    event?: {
      type?: string;
      text?: string;
      channel?: string;
      thread_ts?: string;
      ts?: string;
    };
  };

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge ?? "" });
  }

  if (body.type !== "event_callback" || body.event?.type !== "app_mention" || !body.event.channel || !body.event.text) {
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
  const context = await fetchProjectCopilotContext(supabase as never, parsed.projectId);
  if (context.error || !context.data) {
    await sendSlackChannelMessage({
      channel: body.event.channel,
      threadTs: body.event.thread_ts ?? body.event.ts,
      text: context.error === "Project not found"
        ? `I couldn’t find project ${parsed.projectId}. ${buildSlackProjectHelpText()}`
        : (context.error ?? "Failed to load project context"),
    });
    return NextResponse.json({ ok: true });
  }

  const response = buildSlackProjectResponse({
    command: parsed,
    project: context.data.project,
    categoryActuals: context.data.categoryActuals,
  });

  await sendSlackChannelMessage({
    channel: body.event.channel,
    threadTs: body.event.thread_ts ?? body.event.ts,
    text: response.text,
    blocks: response.blocks,
  });

  return NextResponse.json({ ok: true });
}
