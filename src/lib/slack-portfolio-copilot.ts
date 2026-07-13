import {
  buildSubscriptionScopeLabel,
  type SubscriptionAction,
  type SubscriptionScopeType,
  type ThresholdRecommendationInput,
  type DigestRecommendationInput,
} from "@/lib/project-subscriptions";
import type { ProjectSubscriptionListRow } from "@/lib/project-subscription-store";

export type PortfolioExceptionKey = "over_budget" | "labor_risk";

export type SlackPortfolioIntent =
  | "setup"
  | "create_digest"
  | "create_exception"
  | "subscriptions"
  | "pause"
  | "resume"
  | "delete"
  | "save_portfolio"
  | "saved_portfolios"
  | "delete_saved"
  | "help";

export type SlackPortfolioCommand = {
  intent: SlackPortfolioIntent;
  requestText: string;
  subscriptionId: string | null;
  scopeType: SubscriptionScopeType | null;
  scopeJson: Record<string, unknown>;
  portfolioName?: string | null;
  projectIds?: string[];
  exceptionKey?: PortfolioExceptionKey | null;
};

export type SlackPortfolioActionPayload = {
  type: "create_portfolio_subscription";
  scopeType: SubscriptionScopeType;
  scopeJson: Record<string, unknown>;
  recommendation: ThresholdRecommendationInput | DigestRecommendationInput;
};

export type SlackMessageBlock = Record<string, unknown>;

export function buildSlackPortfolioHelpText() {
  return [
    "Use `/project portfolio ...` for multi-project monitoring.",
    "Examples:",
    "• `/project portfolio`",
    "• `/project portfolio my-active digest`",
    "• `/project portfolio my-active over-budget`",
    "• `/project portfolio my-active labor-risk`",
    "• `/project portfolio pm PM digest`",
    "• `/project portfolio saved client-a digest`",
    "• `/project portfolio save client-a 26144 26145 26146`",
    "• `/project portfolio saved`",
    "• `/project portfolio delete-saved client-a`",
  ].join("\n");
}

function isDigestToken(value?: string | null) {
  return !value || /^digest$/i.test(value);
}

function buildScopeCommand(scopeType: SubscriptionScopeType, scopeJson: Record<string, unknown>, requestText: string, second?: string, third?: string): SlackPortfolioCommand | { error: string } {
  if (isDigestToken(second)) {
    return {
      intent: "create_digest",
      requestText,
      subscriptionId: null,
      scopeType,
      scopeJson,
      exceptionKey: null,
    };
  }

  const token = (second ?? third ?? "").toLowerCase();
  if (token === "over-budget") {
    return {
      intent: "create_exception",
      requestText,
      subscriptionId: null,
      scopeType,
      scopeJson,
      exceptionKey: "over_budget",
    };
  }

  if (token === "labor-risk") {
    return {
      intent: "create_exception",
      requestText,
      subscriptionId: null,
      scopeType,
      scopeJson,
      exceptionKey: "labor_risk",
    };
  }

  return { error: buildSlackPortfolioHelpText() };
}

export function parseSlackPortfolioCommand(text: string): SlackPortfolioCommand | { error: string } {
  const normalized = text.trim();
  if (!/^portfolio\b/i.test(normalized)) {
    return { error: buildSlackPortfolioHelpText() };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const rest = parts.slice(1);
  const requestText = rest.join(" ");
  if (rest.length === 0) {
    return { intent: "setup", requestText: "", subscriptionId: null, scopeType: null, scopeJson: {} };
  }

  const [first, second, third, ...remaining] = rest;

  if (/^subscriptions$/i.test(first)) {
    return { intent: "subscriptions", requestText, subscriptionId: null, scopeType: null, scopeJson: {} };
  }

  if (/^saved$/i.test(first) && !second) {
    return { intent: "saved_portfolios", requestText, subscriptionId: null, scopeType: null, scopeJson: {} };
  }

  if (/^(pause|resume|delete)$/i.test(first)) {
    const subscriptionId = second?.trim();
    if (!subscriptionId) {
      return { error: `Include a subscription id, like \`/project portfolio ${first.toLowerCase()} <subscription-id>\`.` };
    }
    return {
      intent: first.toLowerCase() as SubscriptionAction,
      requestText,
      subscriptionId,
      scopeType: null,
      scopeJson: {},
    };
  }

  if (/^help$/i.test(first)) {
    return { intent: "help", requestText, subscriptionId: null, scopeType: null, scopeJson: {} };
  }

  if (/^save$/i.test(first)) {
    const portfolioName = second?.trim().toLowerCase();
    if (!portfolioName) {
      return { error: "Use `/project portfolio save <name> <job-number>...`, like `/project portfolio save client-a 26144 26145`." };
    }
    if (remaining.length === 0 && !third) {
      return { error: "Add one or more project ids when saving a portfolio." };
    }
    const projectIds = [third, ...remaining].filter(Boolean) as string[];
    return {
      intent: "save_portfolio",
      requestText,
      subscriptionId: null,
      scopeType: null,
      scopeJson: {},
      portfolioName,
      projectIds,
    };
  }

  if (/^delete-saved$/i.test(first)) {
    const portfolioName = second?.trim().toLowerCase();
    if (!portfolioName) {
      return { error: "Use `/project portfolio delete-saved <name>`." };
    }
    return {
      intent: "delete_saved",
      requestText,
      subscriptionId: null,
      scopeType: null,
      scopeJson: {},
      portfolioName,
    };
  }

  if (/^my-active$/i.test(first)) {
    return buildScopeCommand("my_active_projects", {}, requestText, second);
  }

  if (/^all-active$/i.test(first)) {
    return buildScopeCommand("all_active_projects", {}, requestText, second);
  }

  if (/^pm$/i.test(first)) {
    const pmInitials = second?.toUpperCase();
    if (!pmInitials) {
      return { error: "Use `/project portfolio pm <PM initials> digest`, like `/project portfolio pm PM digest`." };
    }
    return buildScopeCommand("pm_active_projects", { pm_initials: pmInitials }, requestText, third);
  }

  if (/^saved$/i.test(first)) {
    const portfolioName = second?.trim().toLowerCase();
    if (!portfolioName) {
      return { error: "Use `/project portfolio saved <name> digest`, like `/project portfolio saved client-a digest`." };
    }
    return buildScopeCommand(
      "saved_portfolio",
      { portfolio_slug: portfolioName, portfolio_name: portfolioName },
      requestText,
      third
    );
  }

  return { error: buildSlackPortfolioHelpText() };
}

function formatLastTriggered(value: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

export function buildSlackPortfolioRecommendation(args: {
  scopeType: SubscriptionScopeType;
  scopeJson: Record<string, unknown>;
  exceptionKey: PortfolioExceptionKey;
}) {
  const scopeLabel = buildSubscriptionScopeLabel(args.scopeType, args.scopeJson);
  if (args.exceptionKey === "over_budget") {
    const recommendation: ThresholdRecommendationInput = {
      type: "threshold",
      metricKey: "budget_variance_pct",
      scopeKey: "total_budget",
      unit: "percent",
      currentValue: null,
      basisValue: 0,
      basisLabel: "Budget variance percentage",
      spotlight: { id: "over_budget", label: "Over budget", threshold: 0 },
      options: [{ id: "over_budget", label: "Over budget", threshold: 0 }],
      message: `I can alert you when any ${scopeLabel} project goes over budget.`,
    };
    return {
      message: recommendation.message,
      recommendation,
    };
  }

  const recommendation: ThresholdRecommendationInput = {
    type: "threshold",
    metricKey: "labor_budget_pct",
    scopeKey: "budget_hrs",
    unit: "percent",
    currentValue: null,
    basisValue: 100,
    basisLabel: "Labor budget percentage",
    spotlight: { id: "warning", label: "Labor risk", threshold: 95 },
    options: [{ id: "warning", label: "Labor risk", threshold: 95 }],
    message: `I can alert you when any ${scopeLabel} project reaches 95% of its labor budget.`,
  };
  return {
    message: recommendation.message,
    recommendation,
  };
}

export function buildSlackPortfolioConfirmationText(args: {
  action: "create" | SubscriptionAction;
  scopeType?: SubscriptionScopeType | null;
  scopeJson?: Record<string, unknown>;
  subscriptionId?: string | null;
}) {
  if (args.action === "create") {
    return `Saved portfolio subscription for ${buildSubscriptionScopeLabel(args.scopeType ?? "all_active_projects", args.scopeJson ?? {})}. Delivery: Slack DM to the creator.`;
  }
  if (args.action === "pause") {
    return `Paused subscription ${args.subscriptionId}.`;
  }
  if (args.action === "resume") {
    return `Resumed subscription ${args.subscriptionId}.`;
  }
  return `Deleted subscription ${args.subscriptionId}.`;
}

export function buildSlackPortfolioSubscriptionListText(subscriptions: ProjectSubscriptionListRow[]) {
  if (subscriptions.length === 0) {
    return "You don’t have any portfolio subscriptions yet.";
  }

  return [
    "Your portfolio subscriptions:",
    ...subscriptions.map((subscription) => {
      const scopeLabel = buildSubscriptionScopeLabel(subscription.scope_type, subscription.scope_json ?? {});
      return `• ${subscription.id} — ${subscription.summary_text} — scope: ${scopeLabel} — ${subscription.status} — last triggered ${formatLastTriggered(subscription.last_triggered_at)}`;
    }),
  ].join("\n");
}

export function buildSlackSavedPortfolioListText(portfolios: Array<{ name: string; slug: string; project_ids?: string[] }>) {
  if (portfolios.length === 0) {
    return "You don’t have any saved portfolios yet.";
  }

  return [
    "Your saved portfolios:",
    ...portfolios.map((portfolio) => `• ${portfolio.slug} — ${portfolio.project_ids?.length ?? 0} project(s)`),
  ].join("\n");
}

export function encodeSlackPortfolioActionValue(payload: SlackPortfolioActionPayload) {
  return JSON.stringify(payload);
}

export function decodeSlackPortfolioActionValue(value: string) {
  return JSON.parse(value) as SlackPortfolioActionPayload;
}

export function buildSlackPortfolioSetupBlocks(): SlackMessageBlock[] {
  const makeButton = (text: string, payload: SlackPortfolioActionPayload) => ({
    type: "button",
    action_id: "create_portfolio_subscription",
    text: { type: "plain_text", text },
    style: "primary",
    value: encodeSlackPortfolioActionValue(payload),
  });

  const myDigest: SlackPortfolioActionPayload = {
    type: "create_portfolio_subscription",
    scopeType: "my_active_projects",
    scopeJson: {},
    recommendation: {
      type: "digest",
      digestKey: "portfolio_digest",
      defaultSections: ["portfolio_health", "biggest_changes", "highest_spend_projects"],
      message: "I can send a portfolio digest.",
    },
  };
  const allDigest: SlackPortfolioActionPayload = {
    ...myDigest,
    scopeType: "all_active_projects",
  };
  const overBudget = buildSlackPortfolioRecommendation({ scopeType: "my_active_projects", scopeJson: {}, exceptionKey: "over_budget" }).recommendation;
  const laborRisk = buildSlackPortfolioRecommendation({ scopeType: "my_active_projects", scopeJson: {}, exceptionKey: "labor_risk" }).recommendation;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Portfolio subscriptions*\nChoose a common setup below, or use `/project portfolio help` for saved portfolios and PM-specific commands.",
      },
    },
    {
      type: "actions",
      elements: [
        makeButton("My digest", myDigest),
        makeButton("All digest", allDigest),
      ],
    },
    {
      type: "actions",
      elements: [
        makeButton("My over-budget alert", {
          type: "create_portfolio_subscription",
          scopeType: "my_active_projects",
          scopeJson: {},
          recommendation: overBudget,
        }),
        makeButton("My labor-risk alert", {
          type: "create_portfolio_subscription",
          scopeType: "my_active_projects",
          scopeJson: {},
          recommendation: laborRisk,
        }),
      ],
    },
  ];
}
