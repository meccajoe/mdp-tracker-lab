import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { fetchProjectCopilotContext } from "@/lib/project-copilot-context";
import { listSlackDmSubscriptionsForProject, updateSlackDmSubscriptionStatus } from "@/lib/project-subscription-store";
import { buildSubscriptionCreatePayload } from "@/lib/project-subscriptions";
import { lookupSlackEmailByUserId } from "@/lib/slack-delivery";
import {
  buildSlackSubscriptionActionResponse,
  decodeSlackSubscriptionActionValue,
} from "@/lib/slack-project-copilot";
import { verifySlackRequest } from "@/lib/slack-request";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MDP_SLACK_SIGNING_SECRET = process.env.MDP_SLACK_SIGNING_SECRET;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function lookupCreatorEmail(slackUserId: string) {
  try {
    return await lookupSlackEmailByUserId(slackUserId);
  } catch {
    return null;
  }
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
  if (payload.type !== "block_actions" || !action?.value || !action.action_id) {
    return NextResponse.json({ text: "Unsupported Slack action." }, { status: 400 });
  }

  const actionPayload = decodeSlackSubscriptionActionValue(action.value);
  const slackUserId = payload.user?.id;
  if (!slackUserId) {
    return NextResponse.json({ text: "Missing Slack user." }, { status: 400 });
  }

  const creatorEmail = await lookupCreatorEmail(slackUserId);
  const creatorIdentifier = creatorEmail ?? `slack:${slackUserId}`;
  const supabase = getSupabaseAdmin();

  const context = await fetchProjectCopilotContext(supabase, actionPayload.projectId);
  if (context.error || !context.data) {
    return NextResponse.json({
      response_action: "update",
      text: context.error ?? "Failed to load project context",
    }, { status: 500 });
  }

  if (action.action_id === "create_project_subscription" && actionPayload.type === "create_subscription") {
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

    const { error } = await supabase
      .from("project_subscriptions")
      .insert(subscriptionPayload);

    if (error) {
      return NextResponse.json({
        response_action: "update",
        text: `I couldn’t save that subscription yet: ${error.message}`,
      }, { status: 500 });
    }

    const list = await listSlackDmSubscriptionsForProject({
      supabase,
      projectId: actionPayload.projectId,
      slackUserId,
      createdByEmail: creatorEmail,
    });

    if (list.error) {
      return NextResponse.json({
        response_action: "update",
        text: list.error,
      }, { status: 500 });
    }

    const response = buildSlackSubscriptionActionResponse({
      projectId: actionPayload.projectId,
      projectName: context.data.project.name,
      subscriptions: list.data ?? [],
      confirmation: {
        tone: "success",
        text: `Saved ${actionPayload.recommendation.type === "digest" ? "digest" : "alert"}. Delivery: Slack DM to <@${slackUserId}>.`,
      },
    });

    return NextResponse.json({
      response_action: "update",
      text: response.text,
      blocks: response.blocks,
    });
  }

  if (["pause_project_subscription", "resume_project_subscription", "delete_project_subscription"].includes(action.action_id) && actionPayload.type === "manage_subscription") {
    const updated = await updateSlackDmSubscriptionStatus({
      supabase,
      projectId: actionPayload.projectId,
      subscriptionId: actionPayload.subscriptionId,
      action: actionPayload.action,
      slackUserId,
      createdByEmail: creatorEmail,
    });

    if (updated.error) {
      return NextResponse.json({
        response_action: "update",
        text: updated.error,
      }, { status: 500 });
    }

    const list = await listSlackDmSubscriptionsForProject({
      supabase,
      projectId: actionPayload.projectId,
      slackUserId,
      createdByEmail: creatorEmail,
    });

    if (list.error) {
      return NextResponse.json({
        response_action: "update",
        text: list.error,
      }, { status: 500 });
    }

    const response = buildSlackSubscriptionActionResponse({
      projectId: actionPayload.projectId,
      projectName: context.data.project.name,
      subscriptions: list.data ?? [],
      confirmation: {
        tone: actionPayload.action === "delete" ? "danger" : actionPayload.action === "pause" ? "warning" : "success",
        text: actionPayload.action === "delete"
          ? `Deleted subscription ${actionPayload.subscriptionId}.`
          : actionPayload.action === "pause"
            ? `Paused subscription ${actionPayload.subscriptionId}.`
            : `Resumed subscription ${actionPayload.subscriptionId}.`,
      },
    });

    return NextResponse.json({
      response_action: "update",
      text: response.text,
      blocks: response.blocks,
    });
  }

  return NextResponse.json({ text: "Unsupported Slack action." }, { status: 400 });
}
