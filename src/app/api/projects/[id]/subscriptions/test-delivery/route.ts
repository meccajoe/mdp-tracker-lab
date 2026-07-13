import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { buildSlackTestMessage, openSlackDmChannel, sendSlackDmByEmail, sendSlackMessage } from "@/lib/slack-delivery";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MDP_SLACK_BOT_TOKEN = process.env.MDP_SLACK_BOT_TOKEN;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function requireAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error || !user?.email) {
    return {
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
      user: null,
    };
  }

  return { error: null, user };
}

function extractSlackUserId(args: {
  targetJson?: Record<string, unknown> | null;
  createdByEmail?: string | null;
}) {
  const directSlackUserId = typeof args.targetJson?.slack_user_id === "string"
    ? args.targetJson.slack_user_id.trim().toUpperCase()
    : "";
  if (directSlackUserId && !directSlackUserId.startsWith("UTEST")) {
    return directSlackUserId;
  }

  const createdByEmail = String(args.createdByEmail ?? "").trim();
  if (/^slack:/i.test(createdByEmail)) {
    const parsed = createdByEmail.split(":", 2)[1]?.trim().toUpperCase() ?? "";
    if (parsed && !parsed.startsWith("UTEST")) {
      return parsed;
    }
  }

  return null;
}

async function findFallbackSlackUserId(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from("project_subscriptions")
    .select("created_by_email, target_json")
    .eq("channel", "slack_dm")
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) {
    return { data: null, error: error.message };
  }

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const slackUserId = extractSlackUserId({
      targetJson: (row.target_json as Record<string, unknown> | null | undefined) ?? null,
      createdByEmail: typeof row.created_by_email === "string" ? row.created_by_email : null,
    });
    if (slackUserId) {
      return { data: slackUserId, error: null };
    }
  }

  return { data: null, error: null };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedUser();
  if (auth.error || !auth.user?.email) {
    return auth.error ?? NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!MDP_SLACK_BOT_TOKEN) {
    return NextResponse.json({ error: "MDP_SLACK_BOT_TOKEN is not configured" }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    subscriptionId?: string;
    summaryText?: string;
    recommendationMessage?: string;
    targetEmail?: string;
  };

  const supabase = getSupabaseAdmin();
  const { data: projectRow, error: projectError } = await supabase
    .from("project_summary")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!projectRow) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let summaryText = body.summaryText?.trim() || null;
  let subscriptionSlackUserId: string | null = null;
  if (!summaryText && body.subscriptionId) {
    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("project_subscriptions")
      .select("summary_text, target_json, created_by_email")
      .eq("project_id", id)
      .eq("id", body.subscriptionId)
      .maybeSingle();

    if (subscriptionError) {
      return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
    }

    summaryText = (subscriptionRow as { summary_text?: string } | null)?.summary_text?.trim() || null;
    subscriptionSlackUserId = extractSlackUserId({
      targetJson: (subscriptionRow as { target_json?: Record<string, unknown> | null } | null)?.target_json ?? null,
      createdByEmail: (subscriptionRow as { created_by_email?: string | null } | null)?.created_by_email ?? null,
    });
  }

  if (!summaryText) {
    return NextResponse.json({ error: "summaryText or subscriptionId is required" }, { status: 400 });
  }

  const targetEmail = (body.targetEmail?.trim().toLowerCase() || auth.user.email.toLowerCase());
  const text = buildSlackTestMessage({
    projectId: String(projectRow.id),
    projectName: String((projectRow as { name?: string }).name ?? projectRow.id),
    summaryText,
    recommendationMessage: body.recommendationMessage ?? null,
  });

  try {
    const delivery = await sendSlackDmByEmail(targetEmail, text);
    return NextResponse.json({ ok: true, targetEmail, text, delivery });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Slack delivery failed";

    if (/No Slack user found for /i.test(message)) {
      const fallbackSlackUserId = subscriptionSlackUserId ?? (await findFallbackSlackUserId(supabase)).data;
      if (fallbackSlackUserId) {
        try {
          const channelId = await openSlackDmChannel(fallbackSlackUserId);
          const ts = await sendSlackMessage(channelId, text);
          return NextResponse.json({
            ok: true,
            targetEmail,
            text,
            delivery: {
              userId: fallbackSlackUserId,
              channelId,
              ts,
              fallback: true,
            },
          });
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Slack delivery failed";
          return NextResponse.json({ error: fallbackMessage }, { status: 502 });
        }
      }

      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
