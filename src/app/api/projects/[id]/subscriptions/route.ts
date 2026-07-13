import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  buildSubscriptionCreatePayload,
  type DigestRecommendationInput,
  type ThresholdRecommendationInput,
} from "@/lib/project-subscriptions";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedUser();
  if (auth.error || !auth.user?.email) {
    return auth.error ?? NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const userEmail = auth.user.email.toLowerCase();
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("project_subscriptions")
    .select("id, project_id, created_by_email, channel, target_json, subscription_type, metric_key, condition_operator, threshold_value, schedule_cron, status, cooldown_minutes, summary_text, last_triggered_at, created_at, updated_at, rule_json")
    .eq("project_id", id)
    .eq("channel", "slack_dm")
    .eq("created_by_email", userEmail)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedUser();
  if (auth.error || !auth.user?.email) {
    return auth.error ?? NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const userEmail = auth.user.email.toLowerCase();
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    recommendation?: ThresholdRecommendationInput | DigestRecommendationInput;
  };

  if (!body.recommendation || (body.recommendation.type !== "threshold" && body.recommendation.type !== "digest")) {
    return NextResponse.json({ error: "recommendation is required" }, { status: 400 });
  }

  const payload = buildSubscriptionCreatePayload({
    projectId: id,
    createdByEmail: userEmail,
    recommendation: body.recommendation,
    channel: "slack_dm",
    targetJson: {
      delivery: "slack_dm",
      created_via: "project_modal",
      source_surface: "mdp_tracker_project",
    },
  });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("project_subscriptions")
    .insert(payload)
    .select("id, project_id, created_by_email, channel, target_json, subscription_type, metric_key, condition_operator, threshold_value, schedule_cron, status, cooldown_minutes, summary_text, last_triggered_at, created_at, updated_at, rule_json")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscription: data }, { status: 201 });
}
