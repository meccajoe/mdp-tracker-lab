import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { buildSubscriptionCreatePayload } from "@/lib/project-subscriptions";
import { lookupSlackEmailByUserId } from "@/lib/slack-delivery";
import { decodeSlackSubscriptionActionValue, recommendationToSlackText } from "@/lib/slack-project-copilot";
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

  const form = new URLSearchParams(rawBody);
  const payloadText = form.get("payload");
  if (!payloadText) {
    return NextResponse.json({ text: "Missing Slack action payload." }, { status: 400 });
  }

  const payload = JSON.parse(payloadText) as {
    type?: string;
    user?: { id?: string };
    team?: { id?: string };
    channel?: { id?: string };
    message?: { thread_ts?: string };
    container?: { thread_ts?: string };
    actions?: Array<{ action_id?: string; value?: string }>;
  };

  const action = payload.actions?.[0];
  if (payload.type !== "block_actions" || !action?.value || action.action_id !== "create_project_subscription") {
    return NextResponse.json({ text: "Unsupported Slack action." }, { status: 400 });
  }

  const actionPayload = decodeSlackSubscriptionActionValue(action.value);
  const slackUserId = payload.user?.id;
  if (!slackUserId) {
    return NextResponse.json({ text: "Missing Slack user." }, { status: 400 });
  }

  let creatorIdentifier = `slack:${slackUserId}`;
  try {
    const email = await lookupSlackEmailByUserId(slackUserId);
    if (email) {
      creatorIdentifier = email;
    }
  } catch {
    // Keep the Slack-user fallback so alert creation still works even if email lookup scope is missing.
  }

  const subscriptionPayload = buildSubscriptionCreatePayload({
    projectId: actionPayload.projectId,
    createdByEmail: creatorIdentifier,
    recommendation: actionPayload.recommendation,
    channel: "slack_dm",
    targetJson: {
      delivery: "slack_dm",
      slack_user_id: slackUserId,
      slack_team_id: payload.team?.id ?? null,
      origin_channel_id: payload.channel?.id ?? null,
      origin_thread_ts: payload.message?.thread_ts ?? payload.container?.thread_ts ?? null,
      created_via: "slack",
    },
  });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("project_subscriptions")
    .insert(subscriptionPayload)
    .select("id, summary_text")
    .single();

  if (error) {
    return NextResponse.json({
      response_action: "update",
      text: `I couldn’t save that subscription yet: ${error.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({
    response_action: "update",
    text: [
      "✅ Project alert saved.",
      data?.summary_text ? `• ${data.summary_text}` : null,
      `• Delivery: Slack DM to <@${slackUserId}>`,
      `• Subscription id: ${String((data as { id?: string } | null)?.id ?? "unknown")}`,
      "",
      recommendationToSlackText(actionPayload.recommendation),
    ].filter(Boolean).join("\n"),
  });
}
