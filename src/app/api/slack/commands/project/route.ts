import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { fetchProjectCopilotContext } from "@/lib/project-copilot-context";
import {
  buildSlackProjectHelpText,
  buildSlackProjectResponse,
  parseSlackProjectCommand,
} from "@/lib/slack-project-copilot";
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
  if (form.get("ssl_check") === "1") {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseSlackProjectCommand(form.get("text") ?? "");
  if ("error" in parsed) {
    return NextResponse.json({ response_type: "ephemeral", text: parsed.error });
  }

  const supabase = getSupabaseAdmin();
  const context = await fetchProjectCopilotContext(supabase as never, parsed.projectId);
  if (context.error || !context.data) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: context.error === "Project not found"
        ? `I couldn’t find project ${parsed.projectId}. ${buildSlackProjectHelpText()}`
        : (context.error ?? "Failed to load project context"),
    }, { status: context.error === "Project not found" ? 200 : 500 });
  }

  const response = buildSlackProjectResponse({
    command: parsed,
    project: context.data.project,
    categoryActuals: context.data.categoryActuals,
  });

  return NextResponse.json({
    response_type: "ephemeral",
    text: response.text,
    blocks: response.blocks,
  });
}
