import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { fetchProjectCopilotContext } from "@/lib/project-copilot-context";
import { listSlackDmSubscriptionsForProject, updateSlackDmSubscriptionStatus } from "@/lib/project-subscription-store";
import {
  buildSlackProjectHelpText,
  buildSlackProjectResponse,
  buildSlackSubscriptionListResponse,
  parseSlackProjectCommand,
} from "@/lib/slack-project-copilot";
import { lookupSlackEmailByUserId } from "@/lib/slack-delivery";
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
  const startedAt = Date.now();
  try {
    const rawBody = await request.text();
    const form = new URLSearchParams(rawBody);
    if (form.get("ssl_check") === "1") {
      console.log("[slack/project] ssl_check");
      return NextResponse.json({ ok: true });
    }

    console.log("[slack/project] received", {
      command: form.get("command"),
      text: form.get("text"),
      teamId: form.get("team_id"),
      channelId: form.get("channel_id"),
      userId: form.get("user_id"),
    });

    const isValid = verifySlackRequest({
      rawBody,
      signature: request.headers.get("x-slack-signature"),
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signingSecret: MDP_SLACK_SIGNING_SECRET,
    });

    if (!isValid) {
      console.warn("[slack/project] invalid signature");
      return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
    }

    const parsed = parseSlackProjectCommand(form.get("text") ?? "");
    if ("error" in parsed) {
      console.log("[slack/project] parse error", { elapsedMs: Date.now() - startedAt, error: parsed.error });
      return NextResponse.json({ response_type: "ephemeral", text: parsed.error });
    }

    const supabase = getSupabaseAdmin();
    const slackUserId = form.get("user_id");
    const channelId = form.get("channel_id");
    const teamId = form.get("team_id");
    const threadTs = form.get("thread_ts") ?? form.get("message_ts");

    let projectId = parsed.projectId;
    if (!projectId && teamId && channelId && threadTs) {
      const binding = await findSlackThreadBinding({
        supabase,
        slackTeamId: teamId,
        channelId,
        threadTs,
      });

      if (binding.error) {
        console.warn("[slack/project] binding lookup error", { elapsedMs: Date.now() - startedAt, error: binding.error });
        return NextResponse.json({ response_type: "ephemeral", text: binding.error }, { status: 500 });
      }

      projectId = binding.data?.project_id ?? null;
    }

    if (!projectId) {
      console.log("[slack/project] no project", { elapsedMs: Date.now() - startedAt });
      return NextResponse.json({
        response_type: "ephemeral",
        text: `This command needs a project job number unless the Slack thread is already bound. ${buildSlackProjectHelpText()}`,
      });
    }

    const context = await fetchProjectCopilotContext(supabase, projectId);
    if (context.error || !context.data) {
      console.warn("[slack/project] context error", { elapsedMs: Date.now() - startedAt, error: context.error, projectId });
      return NextResponse.json({
        response_type: "ephemeral",
        text: context.error === "Project not found"
          ? `I couldn’t find project ${projectId}. ${buildSlackProjectHelpText()}`
          : (context.error ?? "Failed to load project context"),
      }, { status: context.error === "Project not found" ? 200 : 500 });
    }

    if (parsed.explicitProject && teamId && channelId && threadTs) {
      await upsertSlackThreadBinding({
        supabase,
        slackTeamId: teamId,
        channelId,
        threadTs,
        projectId,
        createdBySlackUserId: slackUserId,
      });
    }

    if (parsed.intent === "subscriptions") {
      if (!slackUserId) {
        return NextResponse.json({ response_type: "ephemeral", text: "Missing Slack user context." }, { status: 400 });
      }

      const creatorEmail = await lookupCreatorEmail(slackUserId);

      const result = await listSlackDmSubscriptionsForProject({
        supabase,
        projectId,
        slackUserId,
        createdByEmail: creatorEmail,
      });

      if (result.error) {
        console.warn("[slack/project] subscriptions error", { elapsedMs: Date.now() - startedAt, error: result.error, projectId });
        return NextResponse.json({ response_type: "ephemeral", text: result.error }, { status: 500 });
      }

      const response = buildSlackSubscriptionListResponse({
        projectId,
        projectName: context.data.project.name,
        subscriptions: result.data ?? [],
      });

      console.log("[slack/project] subscriptions ok", { elapsedMs: Date.now() - startedAt, projectId });
      return NextResponse.json({ response_type: "ephemeral", text: response.text, blocks: response.blocks });
    }

    if (parsed.intent === "pause" || parsed.intent === "resume" || parsed.intent === "delete") {
      if (!slackUserId || !parsed.subscriptionId) {
        return NextResponse.json({ response_type: "ephemeral", text: "Missing Slack user or subscription id." }, { status: 400 });
      }

      const creatorEmail = await lookupCreatorEmail(slackUserId);

      const updated = await updateSlackDmSubscriptionStatus({
        supabase,
        projectId,
        subscriptionId: parsed.subscriptionId,
        action: parsed.intent,
        slackUserId,
        createdByEmail: creatorEmail,
      });

      if (updated.error) {
        console.warn("[slack/project] manage error", { elapsedMs: Date.now() - startedAt, error: updated.error, projectId, action: parsed.intent });
        return NextResponse.json({ response_type: "ephemeral", text: updated.error }, { status: 500 });
      }

      const result = await listSlackDmSubscriptionsForProject({
        supabase,
        projectId,
        slackUserId,
        createdByEmail: creatorEmail,
      });

      if (result.error) {
        console.warn("[slack/project] list after manage error", { elapsedMs: Date.now() - startedAt, error: result.error, projectId, action: parsed.intent });
        return NextResponse.json({ response_type: "ephemeral", text: result.error }, { status: 500 });
      }

      const response = buildSlackSubscriptionListResponse({
        projectId,
        projectName: context.data.project.name,
        subscriptions: result.data ?? [],
      });

      console.log("[slack/project] manage ok", { elapsedMs: Date.now() - startedAt, projectId, action: parsed.intent });
      return NextResponse.json({ response_type: "ephemeral", text: response.text, blocks: response.blocks });
    }

    const response = buildSlackProjectResponse({
      command: { ...parsed, projectId },
      project: context.data.project,
      categoryActuals: context.data.categoryActuals,
    });

    console.log("[slack/project] summary ok", { elapsedMs: Date.now() - startedAt, projectId, intent: parsed.intent });
    return NextResponse.json({
      response_type: "ephemeral",
      text: response.text,
      blocks: response.blocks,
    });
  } catch (error) {
    console.error("[slack/project] unhandled error", {
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ response_type: "ephemeral", text: "Slack command failed unexpectedly." }, { status: 500 });
  }
}
