import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { buildSlackTestMessage, sendSlackDmByEmail } from "@/lib/slack-delivery";

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
  if (!summaryText && body.subscriptionId) {
    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("project_subscriptions")
      .select("summary_text")
      .eq("project_id", id)
      .eq("id", body.subscriptionId)
      .maybeSingle();

    if (subscriptionError) {
      return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
    }

    summaryText = (subscriptionRow as { summary_text?: string } | null)?.summary_text?.trim() || null;
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Slack delivery failed" }, { status: 502 });
  }
}
