import {
  buildProjectNotificationRecommendation,
  type DigestRecommendation,
  type ProjectNotificationRecommendation,
  type RecommendationProjectFacts,
  type ThresholdRecommendation,
} from "@/lib/project-notification-recommendations";
import type {
  DigestRecommendationInput,
  SubscriptionAction,
  ThresholdRecommendationInput,
} from "@/lib/project-subscriptions";
import type { ProjectSubscriptionListRow } from "@/lib/project-subscription-store";

export type SlackMessageBlock = Record<string, unknown>;

export type SlackProjectIntent =
  | "summary"
  | "budget"
  | "labor"
  | "notify"
  | "subscriptions"
  | "pause"
  | "resume"
  | "delete"
  | "help";

export type SlackProjectCommand = {
  projectId: string | null;
  explicitProject: boolean;
  intent: SlackProjectIntent;
  requestText: string;
  subscriptionId: string | null;
};

export type SlackSubscriptionActionPayload =
  | {
      type: "create_subscription";
      projectId: string;
      recommendation: ThresholdRecommendationInput | DigestRecommendationInput;
    }
  | {
      type: "manage_subscription";
      projectId: string;
      subscriptionId: string;
      action: SubscriptionAction;
    };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildHelpText() {
  return [
    "Use `/project <job-number> <intent>` from any Slack channel where the bot is present.",
    "Examples:",
    "• `/project 26144 summary`",
    "• `/project 26144 budget`",
    "• `/project 26144 labor`",
    "• `/project 26144 notify labor too high`",
    "• `/project 26144 subscriptions`",
    "• `/project 26144 pause <subscription-id>`",
  ].join("\n");
}

function isIntentToken(token: string) {
  return /^(summary|budget|labor|hours|notify|subscriptions|pause|resume|delete|help)$/i.test(token);
}

function parseIntentParts(parts: string[], projectId: string | null, explicitProject: boolean): SlackProjectCommand | { error: string } {
  if (parts.length === 0) {
    return { projectId, explicitProject, intent: "summary", requestText: "summary", subscriptionId: null };
  }

  const [first, ...rest] = parts;
  const requestText = parts.join(" ").trim();

  if (/^summary$/i.test(first)) {
    return { projectId, explicitProject, intent: "summary", requestText, subscriptionId: null };
  }

  if (/^budget$/i.test(first)) {
    return { projectId, explicitProject, intent: "budget", requestText, subscriptionId: null };
  }

  if (/^(labor|hours)$/i.test(first)) {
    return { projectId, explicitProject, intent: "labor", requestText, subscriptionId: null };
  }

  if (/^notify$/i.test(first)) {
    const notifyText = rest.join(" ").trim();
    if (!notifyText) {
      return { error: "Tell me what to watch, like `/project 26144 notify labor too high`." };
    }
    return { projectId, explicitProject, intent: "notify", requestText: notifyText, subscriptionId: null };
  }

  if (/^subscriptions$/i.test(first)) {
    return { projectId, explicitProject, intent: "subscriptions", requestText, subscriptionId: null };
  }

  if (/^(pause|resume|delete)$/i.test(first)) {
    const subscriptionId = rest[0]?.trim() ?? "";
    if (!subscriptionId) {
      return { error: `Include a subscription id, like "/project 26144 ${first.toLowerCase()} <subscription-id>".` };
    }
    return {
      projectId,
      explicitProject,
      intent: first.toLowerCase() as "pause" | "resume" | "delete",
      requestText,
      subscriptionId,
    };
  }

  if (/^help$/i.test(first)) {
    return { projectId, explicitProject, intent: "help", requestText, subscriptionId: null };
  }

  return { error: buildHelpText() };
}

export function stripSlackBotMention(text: string) {
  return text.replace(/^<@[^>]+>\s*/, "").trim();
}

export function parseSlackProjectCommand(text: string): SlackProjectCommand | { error: string } {
  const normalized = text.trim();
  if (!normalized) {
    return { error: buildHelpText() };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const [first, ...rest] = parts;

  if (isIntentToken(first)) {
    return parseIntentParts(parts, null, false);
  }

  return parseIntentParts(rest, first, true);
}

export function buildProjectSummaryText(project: RecommendationProjectFacts) {
  return [
    `*Project ${project.id} — ${project.name}*`,
    `• Total budget: ${formatCurrency(project.total_budget)}`,
    `• Total spent: ${formatCurrency(project.total_spent)}`,
    `• Labor hours: ${project.qbo_total_hours.toLocaleString()}`,
  ].join("\n");
}

export function buildProjectBudgetText(project: RecommendationProjectFacts) {
  const remaining = project.total_budget - project.total_spent;
  return [
    `*Project ${project.id} — Budget snapshot*`,
    `• Total budget: ${formatCurrency(project.total_budget)}`,
    `• Total spent: ${formatCurrency(project.total_spent)}`,
    `• Remaining: ${formatCurrency(remaining)}`,
  ].join("\n");
}

export function buildProjectLaborText(project: RecommendationProjectFacts) {
  const laborBudget = project.budget_hrs ? `${project.budget_hrs.toLocaleString()} hrs` : "Not set";
  return [
    `*Project ${project.id} — Labor snapshot*`,
    `• Current labor hours: ${project.qbo_total_hours.toLocaleString()}`,
    `• Labor budget: ${laborBudget}`,
  ].join("\n");
}

export function recommendationToSlackText(
  recommendation: ProjectNotificationRecommendation | ThresholdRecommendationInput | DigestRecommendationInput
) {
  if (recommendation.type === "clarify") {
    return recommendation.message;
  }

  if (recommendation.type === "digest") {
    return `${recommendation.message}\n• Delivery default: Slack DM to the user who creates it.`;
  }

  const options = recommendation.options
    .map((option) => `• ${option.label}: ${recommendation.unit === "currency" ? formatCurrency(option.threshold) : recommendation.unit === "percent" ? `${option.threshold}%` : `${option.threshold} hrs`}`)
    .join("\n");

  return [
    recommendation.message,
    "",
    "Recommended thresholds:",
    options,
    "",
    `Default if you click create now: ${recommendation.spotlight.label}`,
    "Delivery default: Slack DM to the user who creates it.",
  ].join("\n");
}

export function toProjectNotificationRecommendation(
  recommendation: ThresholdRecommendationInput | DigestRecommendationInput
): ThresholdRecommendation | DigestRecommendation {
  return recommendation as ThresholdRecommendation | DigestRecommendation;
}

export function encodeSlackSubscriptionActionValue(payload: SlackSubscriptionActionPayload) {
  return JSON.stringify(payload);
}

export function decodeSlackSubscriptionActionValue(value: string): SlackSubscriptionActionPayload {
  return JSON.parse(value) as SlackSubscriptionActionPayload;
}

function formatLastTriggered(value: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

function buildSubscriptionManagementElements(projectId: string, subscription: ProjectSubscriptionListRow) {
  const elements: Array<Record<string, unknown>> = [];

  if (subscription.status === "active") {
    elements.push({
      type: "button",
      action_id: "pause_project_subscription",
      text: { type: "plain_text", text: "Pause" },
      value: encodeSlackSubscriptionActionValue({
        type: "manage_subscription",
        projectId,
        subscriptionId: subscription.id,
        action: "pause",
      }),
    });
  }

  if (subscription.status === "paused") {
    elements.push({
      type: "button",
      action_id: "resume_project_subscription",
      text: { type: "plain_text", text: "Resume" },
      value: encodeSlackSubscriptionActionValue({
        type: "manage_subscription",
        projectId,
        subscriptionId: subscription.id,
        action: "resume",
      }),
    });
  }

  elements.push({
    type: "button",
    action_id: "delete_project_subscription",
    style: "danger",
    text: { type: "plain_text", text: "Delete" },
    value: encodeSlackSubscriptionActionValue({
      type: "manage_subscription",
      projectId,
      subscriptionId: subscription.id,
      action: "delete",
    }),
  });

  return elements;
}

export function buildSlackSubscriptionListResponse(args: {
  projectId: string;
  projectName: string;
  subscriptions: ProjectSubscriptionListRow[];
}) {
  if (args.subscriptions.length === 0) {
    return {
      text: `You don’t have any Slack DM subscriptions for project ${args.projectId} yet.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Project ${args.projectId} — ${args.projectName}*\nYou don’t have any Slack DM subscriptions for this project yet.`,
          },
        },
      ] as SlackMessageBlock[],
    };
  }

  const text = [
    `Project ${args.projectId} — ${args.projectName}`,
    ...args.subscriptions.map((subscription) => `• ${subscription.id} — ${subscription.summary_text} — ${subscription.status} — last triggered ${formatLastTriggered(subscription.last_triggered_at)}`),
  ].join("\n");

  const blocks: SlackMessageBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Project ${args.projectId} — ${args.projectName}*\nYour Slack DM subscriptions:`,
      },
    },
  ];

  for (const subscription of args.subscriptions.slice(0, 10)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${subscription.summary_text}*\n• id: ${subscription.id}\n• status: ${subscription.status}\n• last triggered: ${formatLastTriggered(subscription.last_triggered_at)}`,
      },
    });

    blocks.push({
      type: "actions",
      elements: buildSubscriptionManagementElements(args.projectId, subscription),
    });
  }

  return { text, blocks };
}

export function buildSlackNotificationBlocks(args: {
  project: RecommendationProjectFacts;
  recommendation: ProjectNotificationRecommendation;
}): SlackMessageBlock[] {
  const sectionText = recommendationToSlackText(args.recommendation);
  const blocks: SlackMessageBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Project ${args.project.id} — ${args.project.name}*\n${sectionText}`,
      },
    },
  ];

  if (args.recommendation.type === "threshold" || args.recommendation.type === "digest") {
    const payload: SlackSubscriptionActionPayload = {
      type: "create_subscription",
      projectId: args.project.id,
      recommendation: args.recommendation,
    };

    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "create_project_subscription",
          text: {
            type: "plain_text",
            text: args.recommendation.type === "digest" ? "Create digest (DM me)" : "Create alert (DM me)",
          },
          style: "primary",
          value: encodeSlackSubscriptionActionValue(payload),
        },
      ],
    });
  }

  return blocks;
}

export function buildSlackProjectResponse(args: {
  command: SlackProjectCommand;
  project: RecommendationProjectFacts;
  categoryActuals: Record<string, number | undefined>;
}): { text: string; blocks?: SlackMessageBlock[] } {
  switch (args.command.intent) {
    case "summary":
      return { text: buildProjectSummaryText(args.project) };
    case "budget":
      return { text: buildProjectBudgetText(args.project) };
    case "labor":
      return { text: buildProjectLaborText(args.project) };
    case "notify": {
      const recommendation = buildProjectNotificationRecommendation({
        requestText: args.command.requestText,
        project: args.project,
        categoryActuals: args.categoryActuals,
      });
      return {
        text: recommendationToSlackText(recommendation),
        blocks: buildSlackNotificationBlocks({ project: args.project, recommendation }),
      };
    }
    case "subscriptions":
    case "pause":
    case "resume":
    case "delete":
      return { text: "Subscription management is handled separately." };
    case "help":
      return { text: buildHelpText() };
  }
}

export function buildSlackProjectHelpText() {
  return buildHelpText();
}
