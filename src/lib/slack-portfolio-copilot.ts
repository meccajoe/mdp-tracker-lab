import { buildSubscriptionScopeLabel, type SubscriptionAction, type SubscriptionScopeType } from "@/lib/project-subscriptions";
import type { ProjectSubscriptionListRow } from "@/lib/project-subscription-store";

export type SlackPortfolioIntent = "create_digest" | "subscriptions" | "pause" | "resume" | "delete" | "help";

export type SlackPortfolioCommand = {
  intent: SlackPortfolioIntent;
  requestText: string;
  subscriptionId: string | null;
  scopeType: SubscriptionScopeType | null;
  scopeJson: Record<string, unknown>;
};

export function buildSlackPortfolioHelpText() {
  return [
    "Use `/project portfolio ...` for multi-project monitoring.",
    "Examples:",
    "• `/project portfolio my-active digest`",
    "• `/project portfolio pm PM digest`",
    "• `/project portfolio all-active digest`",
    "• `/project portfolio subscriptions`",
    "• `/project portfolio pause <subscription-id>`",
  ].join("\n");
}

export function parseSlackPortfolioCommand(text: string): SlackPortfolioCommand | { error: string } {
  const normalized = text.trim();
  if (!/^portfolio\b/i.test(normalized)) {
    return { error: buildSlackPortfolioHelpText() };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const rest = parts.slice(1);
  if (rest.length === 0) {
    return { error: buildSlackPortfolioHelpText() };
  }

  const [first, second, third] = rest;
  const requestText = rest.join(" ");

  if (/^subscriptions$/i.test(first)) {
    return { intent: "subscriptions", requestText, subscriptionId: null, scopeType: null, scopeJson: {} };
  }

  if (/^(pause|resume|delete)$/i.test(first)) {
    const subscriptionId = second?.trim();
    if (!subscriptionId) {
      return { error: `Include a subscription id, like "/project portfolio ${first.toLowerCase()} <subscription-id>".` };
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

  if (/^my-active$/i.test(first) && (!second || /^digest$/i.test(second))) {
    return {
      intent: "create_digest",
      requestText,
      subscriptionId: null,
      scopeType: "my_active_projects",
      scopeJson: {},
    };
  }

  if (/^all-active$/i.test(first) && (!second || /^digest$/i.test(second))) {
    return {
      intent: "create_digest",
      requestText,
      subscriptionId: null,
      scopeType: "all_active_projects",
      scopeJson: {},
    };
  }

  if (/^pm$/i.test(first)) {
    const pmInitials = second?.toUpperCase();
    if (!pmInitials) {
      return { error: "Use `/project portfolio pm <PM initials> digest`, like `/project portfolio pm PM digest`." };
    }
    if (third && !/^digest$/i.test(third)) {
      return { error: buildSlackPortfolioHelpText() };
    }
    return {
      intent: "create_digest",
      requestText,
      subscriptionId: null,
      scopeType: "pm_active_projects",
      scopeJson: { pm_initials: pmInitials },
    };
  }

  return { error: buildSlackPortfolioHelpText() };
}

function formatLastTriggered(value: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

export function buildSlackPortfolioConfirmationText(args: {
  action: "create" | SubscriptionAction;
  scopeType?: SubscriptionScopeType | null;
  scopeJson?: Record<string, unknown>;
  subscriptionId?: string | null;
}) {
  if (args.action === "create") {
    return `Saved portfolio digest for ${buildSubscriptionScopeLabel(args.scopeType ?? "all_active_projects", args.scopeJson ?? {})}. Delivery: Slack DM to the creator.`;
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
