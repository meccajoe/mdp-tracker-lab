import { NextRequest, NextResponse } from "next/server";

import { buildPortfolioMonitorRecommendation, buildPortfolioMonitorScopeExtension, type PortfolioMonitorKey } from "@/lib/project-portfolio-monitoring";
import { getSavedPortfolioBySlug } from "@/lib/project-saved-portfolios";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { buildSubscriptionCreatePayload, type DigestRecommendationInput, type SubscriptionScopeType, type ThresholdRecommendationInput } from "@/lib/project-subscriptions";
import { listSlackDmSubscriptions } from "@/lib/project-subscription-store";
import { buildSlackPortfolioRecommendation } from "@/lib/slack-portfolio-copilot";

const PORTFOLIO_SCOPE_TYPES: SubscriptionScopeType[] = [
  "my_active_projects",
  "pm_active_projects",
  "all_active_projects",
  "saved_portfolio",
];

function buildPortfolioDigestRecommendation(scopeLabel: string): DigestRecommendationInput {
  return {
    type: "digest",
    digestKey: "portfolio_digest",
    defaultSections: ["portfolio_health", "biggest_changes", "highest_spend_projects"],
    message: `I can send a portfolio digest for ${scopeLabel}.`,
  };
}

export async function GET() {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const result = await listSlackDmSubscriptions({
    supabase: admin.supabase,
    slackUserId: `web:${admin.actorEmail}`,
    createdByEmail: admin.actorEmail,
    scopeTypes: PORTFOLIO_SCOPE_TYPES,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ subscriptions: result.data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    scopeType?: SubscriptionScopeType;
    pmInitials?: string;
    portfolioSlug?: string;
    mode?: "digest" | "over_budget" | "labor_risk";
    monitorKey?: PortfolioMonitorKey;
  };

  const scopeType = body.scopeType;
  if (!scopeType || !PORTFOLIO_SCOPE_TYPES.includes(scopeType)) {
    return NextResponse.json({ error: "A valid portfolio scope is required." }, { status: 400 });
  }

  const mode = body.mode ?? "digest";
  let scopeJson: Record<string, unknown> = {};
  let scopeLabel = "portfolio";

  if (scopeType === "pm_active_projects") {
    const pmInitials = body.pmInitials?.trim().toUpperCase();
    if (!pmInitials) {
      return NextResponse.json({ error: "PM initials are required for PM active projects." }, { status: 400 });
    }
    scopeJson = { pm_initials: pmInitials };
    scopeLabel = `${pmInitials} active projects`;
  } else if (scopeType === "saved_portfolio") {
    const portfolioSlug = body.portfolioSlug?.trim().toLowerCase();
    if (!portfolioSlug) {
      return NextResponse.json({ error: "A saved portfolio is required." }, { status: 400 });
    }

    const portfolio = await getSavedPortfolioBySlug({
      supabase: admin.supabase,
      createdByEmail: admin.actorEmail,
      slug: portfolioSlug,
    });
    if (portfolio.error) {
      return NextResponse.json({ error: portfolio.error }, { status: 500 });
    }
    if (!portfolio.data) {
      return NextResponse.json({ error: "Saved portfolio not found." }, { status: 404 });
    }

    scopeJson = {
      portfolio_slug: portfolio.data.slug,
      portfolio_name: portfolio.data.name,
    };
    scopeLabel = `saved portfolio ${portfolio.data.name}`;
  } else if (scopeType === "all_active_projects") {
    scopeLabel = "all active projects";
  } else if (scopeType === "my_active_projects") {
    scopeLabel = "my active projects";
  }

  let recommendation: ThresholdRecommendationInput | DigestRecommendationInput;
  if (body.monitorKey) {
    recommendation = buildPortfolioMonitorRecommendation({
      monitorKey: body.monitorKey,
      scopeLabel,
    });
    scopeJson = {
      ...scopeJson,
      ...buildPortfolioMonitorScopeExtension(body.monitorKey),
    };
  } else if (mode === "digest") {
    recommendation = buildPortfolioDigestRecommendation(scopeLabel);
  } else {
    recommendation = buildSlackPortfolioRecommendation({
      scopeType,
      scopeJson,
      exceptionKey: mode === "over_budget" ? "over_budget" : "labor_risk",
    }).recommendation;
  }

  const payload = buildSubscriptionCreatePayload({
    createdByEmail: admin.actorEmail,
    recommendation,
    channel: "slack_dm",
    targetJson: {
      delivery: "slack_dm",
      created_via: "project_modal_portfolio",
      source_surface: "mdp_tracker_project",
    },
    scopeType,
    scopeJson,
  });

  const { data, error } = await admin.supabase
    .from("project_subscriptions")
    .insert(payload)
    .select("id, project_id, created_by_email, channel, target_json, subscription_type, scope_type, scope_json, metric_key, condition_operator, threshold_value, schedule_cron, status, cooldown_minutes, summary_text, last_triggered_at, created_at, updated_at, rule_json")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscription: data }, { status: 201 });
}
