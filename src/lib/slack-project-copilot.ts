import {
  buildProjectNotificationRecommendation,
  type DigestRecommendation,
  type ProjectNotificationRecommendation,
  type RecommendationProjectFacts,
  type ThresholdRecommendation,
} from "@/lib/project-notification-recommendations";
import type { DigestRecommendationInput, ThresholdRecommendationInput } from "@/lib/project-subscriptions";

export type SlackMessageBlock = Record<string, unknown>;

export type SlackProjectIntent = "summary" | "budget" | "labor" | "notify" | "help";

export type SlackProjectCommand = {
  projectId: string;
  intent: SlackProjectIntent;
  requestText: string;
};

export type SlackSubscriptionActionPayload = {
  type: "create_subscription";
  projectId: string;
  recommendation: ThresholdRecommendationInput | DigestRecommendationInput;
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
  ].join("\n");
}

export function stripSlackBotMention(text: string) {
  return text.replace(/^<@[^>]+>\s*/, "").trim();
}

export function parseSlackProjectCommand(text: string): SlackProjectCommand | { error: string } {
  const normalized = text.trim();
  if (!normalized) {
    return { error: buildHelpText() };
  }

  const [projectId, ...rest] = normalized.split(/\s+/);
  if (!projectId) {
    return { error: buildHelpText() };
  }

  const requestText = rest.join(" ").trim();
  if (!requestText) {
    return { projectId, intent: "summary", requestText: "summary" };
  }

  if (/^summary\b/i.test(requestText)) {
    return { projectId, intent: "summary", requestText };
  }

  if (/^budget\b/i.test(requestText)) {
    return { projectId, intent: "budget", requestText };
  }

  if (/^labor\b/i.test(requestText) || /^hours\b/i.test(requestText)) {
    return { projectId, intent: "labor", requestText };
  }

  if (/^notify\b/i.test(requestText)) {
    return { projectId, intent: "notify", requestText: requestText.replace(/^notify\b/i, "").trim() };
  }

  if (/^help\b/i.test(requestText)) {
    return { projectId, intent: "help", requestText };
  }

  return { error: buildHelpText() };
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
    case "help":
      return { text: buildHelpText() };
  }
}

export function buildSlackProjectHelpText() {
  return buildHelpText();
}
