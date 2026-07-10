import { openSlackDmChannel, sendSlackDmByEmail, sendSlackMessage } from "./slack-delivery.ts";
import { fetchProjectCopilotContext, type ProjectCopilotContext } from "./project-copilot-context.ts";
import type { CategoryScopeKey, RecommendationProjectFacts } from "./project-notification-recommendations.ts";

export type EvaluatableProjectSubscription = {
  id: string;
  project_id: string;
  created_by_email: string;
  channel: string;
  target_json: Record<string, unknown> | null;
  subscription_type: "metric_threshold_alert" | "scheduled_digest";
  metric_key: string | null;
  condition_operator: string | null;
  threshold_value: number | null;
  rule_json: Record<string, unknown> | null;
  schedule_cron: string | null;
  status: string;
  cooldown_minutes: number;
  summary_text: string;
  last_evaluated_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionRunRow = {
  id: string;
  outcome: string;
  reason: string | null;
  evaluated_at: string;
  snapshot_json: Record<string, unknown> | null;
};

export type SubscriptionEvaluationResult = {
  subscriptionId: string;
  projectId: string;
  subscriptionType: EvaluatableProjectSubscription["subscription_type"];
  outcome: "triggered" | "skipped" | "error" | "would_trigger";
  reason: string;
  summaryText: string;
  currentValue?: number | null;
  thresholdValue?: number | null;
  delivery?: {
    channel: string;
    target: string | null;
    status: "delivered" | "skipped" | "failed" | "would_deliver";
    externalMessageId?: string | null;
    errorText?: string | null;
  };
};

const APP_TIME_ZONE = "America/Chicago";
const DIGEST_DELIVERY_WINDOW_MINUTES = 75;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatMetricValue(value: number, unit: "hours" | "currency" | "percent") {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percent") return `${formatNumber(value)}%`;
  return `${formatNumber(value)} hrs`;
}

function getRuleUnit(subscription: EvaluatableProjectSubscription): "hours" | "currency" | "percent" {
  const unit = subscription.rule_json?.unit;
  if (unit === "currency" || unit === "percent") return unit;
  return "hours";
}

function getRuleScopeKey(subscription: EvaluatableProjectSubscription): string | null {
  return typeof subscription.rule_json?.scopeKey === "string" ? subscription.rule_json.scopeKey : null;
}

function getBudgetValue(project: RecommendationProjectFacts, scopeKey: string) {
  const record = project as unknown as Record<string, number | null | string>;
  const value = record[scopeKey];
  if (typeof value === "number") return value;
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function calculateBudgetVariancePercent(actual: number, budget: number) {
  if (!budget) return null;
  return ((actual - budget) / budget) * 100;
}

export function getCurrentMetricValue(subscription: EvaluatableProjectSubscription, context: ProjectCopilotContext): number | null {
  switch (subscription.metric_key) {
    case "qbo_total_hours":
      return context.project.qbo_total_hours;
    case "total_spent":
      return context.project.total_spent;
    case "category_actual_spend": {
      const scopeKey = getRuleScopeKey(subscription) as CategoryScopeKey | null;
      if (!scopeKey) return null;
      return context.categoryActuals[scopeKey] ?? 0;
    }
    case "budget_variance_pct": {
      const scopeKey = getRuleScopeKey(subscription);
      if (!scopeKey) return null;
      if (scopeKey === "total_budget") {
        return calculateBudgetVariancePercent(context.project.total_spent, context.project.total_budget);
      }
      const actual = context.categoryActuals[scopeKey as CategoryScopeKey] ?? 0;
      const budget = getBudgetValue(context.project, scopeKey);
      return calculateBudgetVariancePercent(actual, budget);
    }
    default:
      return null;
  }
}

function compareAgainstThreshold(operator: string | null, currentValue: number | null, thresholdValue: number | null) {
  if (currentValue == null || thresholdValue == null) return false;
  switch (operator) {
    case "<=":
      return currentValue <= thresholdValue;
    case ">=":
    default:
      return currentValue >= thresholdValue;
  }
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function cooldownExpiresAt(subscription: EvaluatableProjectSubscription) {
  if (!subscription.last_triggered_at) return null;
  return addMinutes(new Date(subscription.last_triggered_at), subscription.cooldown_minutes || 0);
}

function isCooldownActive(subscription: EvaluatableProjectSubscription, now: Date) {
  const expiresAt = cooldownExpiresAt(subscription);
  return !!(expiresAt && expiresAt > now);
}

function getLocalTimeParts(date: Date, timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: map.weekday,
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

export function isDigestDue(args: {
  scheduleCron: string | null;
  lastTriggeredAt: string | null;
  now: Date;
  force?: boolean;
}) {
  if (args.force) return true;
  if (args.scheduleCron !== "0 16 * * 1-5") return false;

  const nowParts = getLocalTimeParts(args.now);
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(nowParts.weekday)) return false;
  const totalMinutes = nowParts.hour * 60 + nowParts.minute;
  const targetMinutes = 16 * 60;
  if (totalMinutes < targetMinutes || totalMinutes >= targetMinutes + DIGEST_DELIVERY_WINDOW_MINUTES) return false;

  if (!args.lastTriggeredAt) return true;
  const lastParts = getLocalTimeParts(new Date(args.lastTriggeredAt));
  return lastParts.dateKey !== nowParts.dateKey;
}

function buildCategorySnapshot(context: ProjectCopilotContext) {
  return Object.entries(context.categoryActuals)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([scopeKey, value]) => ({ scopeKey, value: value ?? 0 }));
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildMetricSnapshot(context: ProjectCopilotContext) {
  return {
    labor_hours: context.project.qbo_total_hours,
    total_spend: context.project.total_spent,
    category_actuals: Object.fromEntries(Object.entries(context.categoryActuals).map(([key, value]) => [key, value ?? 0])),
  };
}

function formatDelta(value: number, unit: "hours" | "currency" | "percent") {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMetricValue(value, unit)}`;
}

function buildTopChangeLines(currentSnapshot: ReturnType<typeof buildMetricSnapshot>, previousSnapshot?: Record<string, unknown> | null) {
  if (!previousSnapshot) {
    return ["• First digest run — no prior snapshot yet."];
  }

  const previousLabor = toNumber(previousSnapshot.labor_hours);
  const previousSpend = toNumber(previousSnapshot.total_spend);
  const previousCategoryActuals = (previousSnapshot.category_actuals ?? {}) as Record<string, unknown>;

  const lines: string[] = [];
  const laborDelta = currentSnapshot.labor_hours - previousLabor;
  if (laborDelta !== 0) lines.push(`• Labor hours ${formatDelta(laborDelta, "hours")}`);

  const spendDelta = currentSnapshot.total_spend - previousSpend;
  if (spendDelta !== 0) lines.push(`• Total spend ${formatDelta(spendDelta, "currency")}`);

  const categoryDeltas = Object.entries(currentSnapshot.category_actuals)
    .map(([scopeKey, value]) => ({ scopeKey, delta: toNumber(value) - toNumber(previousCategoryActuals[scopeKey]) }))
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  for (const row of categoryDeltas) {
    lines.push(`• ${row.scopeKey.replace(/^budget_/, "")} spend ${formatDelta(row.delta, "currency")}`);
  }

  return lines.length > 0 ? lines : ["• No material changes since the last digest."];
}

async function fetchRecentExpenseActivity(args: {
  supabase: any;
  projectId: string;
  since: string | null;
}) {
  let query = args.supabase
    .from("expenses")
    .select("id, vendor, category, amount, flagged, flagged_at, created_at")
    .eq("project_id", args.projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (args.since) {
    query = query.gte("created_at", args.since);
  }

  const { data, error } = await query;
  if (error) {
    return { data: null, error: error.message };
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    vendor: typeof row.vendor === "string" ? row.vendor : "Unknown vendor",
    category: typeof row.category === "string" ? row.category : "Uncategorized",
    amount: toNumber(row.amount),
    flagged: Boolean(row.flagged),
    flagged_at: typeof row.flagged_at === "string" ? row.flagged_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
  }));

  return { data: rows, error: null };
}

function buildDigestMessage(args: {
  subscription: EvaluatableProjectSubscription;
  context: ProjectCopilotContext;
  previousSnapshot?: Record<string, unknown> | null;
  recentExpenses: Array<{ vendor: string; category: string; amount: number; flagged: boolean; flagged_at: string | null; created_at: string | null }>;
}) {
  const currentSnapshot = buildMetricSnapshot(args.context);
  const topCategories = buildCategorySnapshot(args.context).slice(0, 3);
  const flaggedExpenses = args.recentExpenses.filter((row) => row.flagged).slice(0, 3);
  const recentExpenseCount = args.recentExpenses.length;

  const sections = [
    `📬 Project ${args.context.project.id} — ${args.context.project.name}`,
    args.subscription.summary_text,
    "",
    "Current snapshot",
    `• Labor hours: ${formatMetricValue(args.context.project.qbo_total_hours, "hours")}`,
    `• Total spend: ${formatMetricValue(args.context.project.total_spent, "currency")}`,
    ...(topCategories.length > 0
      ? topCategories.map((row, index) => `• Top category ${index + 1}: ${row.scopeKey.replace(/^budget_/, "")} ${formatMetricValue(row.value, "currency")}`)
      : ["• No category spend tracked yet."]),
    "",
    "Changes since last digest",
    ...buildTopChangeLines(currentSnapshot, args.previousSnapshot),
    "",
    `Recent expenses reviewed: ${recentExpenseCount}`,
    ...(flaggedExpenses.length > 0
      ? [
          `Flagged expenses since last digest: ${flaggedExpenses.length}`,
          ...flaggedExpenses.map((row) => `• ${row.vendor} — ${row.category} ${formatMetricValue(row.amount, "currency")}`),
        ]
      : ["Flagged expenses since last digest: 0"]),
  ];

  return {
    text: sections.join("\n"),
    snapshot: currentSnapshot,
  };
}

function buildThresholdMessage(args: {
  subscription: EvaluatableProjectSubscription;
  context: ProjectCopilotContext;
  currentValue: number;
}) {
  const unit = getRuleUnit(args.subscription);
  const threshold = args.subscription.threshold_value ?? 0;
  const scopeKey = getRuleScopeKey(args.subscription);
  const currentLabel = scopeKey && (args.subscription.metric_key === "category_actual_spend" || args.subscription.metric_key === "budget_variance_pct")
    ? `${scopeKey.replace(/^budget_/, "")} ${args.subscription.metric_key === "budget_variance_pct" ? "variance" : "spend"}`
    : args.subscription.metric_key === "qbo_total_hours"
      ? "labor hours"
      : args.subscription.metric_key === "total_spent"
        ? "total spend"
        : "metric";

  const lines = [
    `🔔 Project ${args.context.project.id} — ${args.context.project.name}`,
    args.subscription.summary_text,
    "",
    `• Current ${currentLabel}: ${formatMetricValue(args.currentValue, unit)}`,
    `• Threshold: ${formatMetricValue(threshold, unit)}`,
  ];

  return {
    text: lines.join("\n"),
    snapshot: {
      current_value: args.currentValue,
      metric_key: args.subscription.metric_key,
      threshold_value: threshold,
      unit,
      scope_key: scopeKey,
    },
  };
}

async function fetchLatestRun(supabase: any, subscriptionId: string): Promise<{ data: SubscriptionRunRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("project_subscription_runs")
    .select("id, outcome, reason, evaluated_at, snapshot_json")
    .eq("subscription_id", subscriptionId)
    .order("evaluated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: (data as SubscriptionRunRow | null) ?? null, error: null };
}

async function recordRun(args: {
  supabase: any;
  subscriptionId: string;
  outcome: string;
  reason: string;
  snapshotJson: Record<string, unknown>;
}) {
  const { data, error } = await args.supabase
    .from("project_subscription_runs")
    .insert({
      subscription_id: args.subscriptionId,
      outcome: args.outcome,
      reason: args.reason,
      snapshot_json: args.snapshotJson,
    })
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as { id: string }, error: null };
}

async function recordDelivery(args: {
  supabase: any;
  subscriptionRunId: string;
  channel: string;
  target: string | null;
  deliveryStatus: string;
  externalMessageId?: string | null;
  errorText?: string | null;
}) {
  const { error } = await args.supabase
    .from("project_subscription_deliveries")
    .insert({
      subscription_run_id: args.subscriptionRunId,
      channel: args.channel,
      target: args.target,
      delivery_status: args.deliveryStatus,
      external_message_id: args.externalMessageId ?? null,
      delivered_at: args.deliveryStatus === "delivered" ? new Date().toISOString() : null,
      error_text: args.errorText ?? null,
    });

  return { error: error?.message ?? null };
}

async function updateSubscriptionTimestamps(args: {
  supabase: any;
  subscriptionId: string;
  lastEvaluatedAt: string;
  lastTriggeredAt?: string | null;
}) {
  const payload: Record<string, unknown> = {
    last_evaluated_at: args.lastEvaluatedAt,
    updated_at: args.lastEvaluatedAt,
  };
  if (args.lastTriggeredAt) payload.last_triggered_at = args.lastTriggeredAt;

  const { error } = await args.supabase
    .from("project_subscriptions")
    .update(payload)
    .eq("id", args.subscriptionId);

  return { error: error?.message ?? null };
}

async function deliverToSubscriptionTarget(args: {
  subscription: EvaluatableProjectSubscription;
  text: string;
}) {
  if (args.subscription.channel !== "slack_dm") {
    return {
      channel: args.subscription.channel,
      target: null,
      status: "skipped" as const,
      externalMessageId: null,
      errorText: "Unsupported delivery channel",
    };
  }

  const slackUserId = typeof args.subscription.target_json?.slack_user_id === "string"
    ? args.subscription.target_json.slack_user_id
    : null;

  try {
    if (slackUserId) {
      const channelId = await openSlackDmChannel(slackUserId);
      const ts = await sendSlackMessage(channelId, args.text);
      return {
        channel: "slack_dm",
        target: slackUserId,
        status: "delivered" as const,
        externalMessageId: ts,
        errorText: null,
      };
    }

    const delivery = await sendSlackDmByEmail(args.subscription.created_by_email, args.text);
    return {
      channel: "slack_dm",
      target: delivery.userId,
      status: "delivered" as const,
      externalMessageId: delivery.ts,
      errorText: null,
    };
  } catch (error) {
    return {
      channel: "slack_dm",
      target: slackUserId,
      status: "failed" as const,
      externalMessageId: null,
      errorText: error instanceof Error ? error.message : "Slack DM delivery failed",
    };
  }
}

async function evaluateThresholdSubscription(args: {
  supabase: any;
  subscription: EvaluatableProjectSubscription;
  context: ProjectCopilotContext;
  previousRun: SubscriptionRunRow | null;
  now: Date;
  dryRun?: boolean;
}) : Promise<SubscriptionEvaluationResult> {
  const currentValue = getCurrentMetricValue(args.subscription, args.context);
  if (currentValue == null) {
    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "skipped",
      reason: "missing_metric_value",
      summaryText: args.subscription.summary_text,
      currentValue: null,
      thresholdValue: args.subscription.threshold_value,
    };
  }

  const thresholdMatched = compareAgainstThreshold(args.subscription.condition_operator, currentValue, args.subscription.threshold_value);
  const previousCurrentValue = args.previousRun?.snapshot_json && Object.prototype.hasOwnProperty.call(args.previousRun.snapshot_json, "current_value")
    ? toNumber(args.previousRun.snapshot_json.current_value)
    : null;
  const previousMatched = previousCurrentValue == null
    ? false
    : compareAgainstThreshold(args.subscription.condition_operator, previousCurrentValue, args.subscription.threshold_value);

  if (!thresholdMatched) {
    if (!args.dryRun) {
      const nowIso = args.now.toISOString();
      await recordRun({
        supabase: args.supabase,
        subscriptionId: args.subscription.id,
        outcome: "skipped",
        reason: "threshold_not_met",
        snapshotJson: {
          current_value: currentValue,
          threshold_value: args.subscription.threshold_value,
          metric_key: args.subscription.metric_key,
          rule_json: args.subscription.rule_json ?? {},
        },
      });
      await updateSubscriptionTimestamps({ supabase: args.supabase, subscriptionId: args.subscription.id, lastEvaluatedAt: nowIso });
    }

    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "skipped",
      reason: "threshold_not_met",
      summaryText: args.subscription.summary_text,
      currentValue,
      thresholdValue: args.subscription.threshold_value,
    };
  }

  if (previousMatched) {
    if (!args.dryRun) {
      const nowIso = args.now.toISOString();
      await recordRun({
        supabase: args.supabase,
        subscriptionId: args.subscription.id,
        outcome: "skipped",
        reason: "already_triggered_state",
        snapshotJson: {
          current_value: currentValue,
          threshold_value: args.subscription.threshold_value,
          metric_key: args.subscription.metric_key,
          rule_json: args.subscription.rule_json ?? {},
        },
      });
      await updateSubscriptionTimestamps({ supabase: args.supabase, subscriptionId: args.subscription.id, lastEvaluatedAt: nowIso });
    }

    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "skipped",
      reason: "already_triggered_state",
      summaryText: args.subscription.summary_text,
      currentValue,
      thresholdValue: args.subscription.threshold_value,
    };
  }

  if (isCooldownActive(args.subscription, args.now)) {
    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "skipped",
      reason: "cooldown_active",
      summaryText: args.subscription.summary_text,
      currentValue,
      thresholdValue: args.subscription.threshold_value,
    };
  }

  const message = buildThresholdMessage({
    subscription: args.subscription,
    context: args.context,
    currentValue,
  });

  if (args.dryRun) {
    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "would_trigger",
      reason: "threshold_crossed",
      summaryText: message.text,
      currentValue,
      thresholdValue: args.subscription.threshold_value,
      delivery: {
        channel: args.subscription.channel,
        target: typeof args.subscription.target_json?.slack_user_id === "string" ? args.subscription.target_json.slack_user_id : args.subscription.created_by_email,
        status: "would_deliver",
      },
    };
  }

  const nowIso = args.now.toISOString();
  const run = await recordRun({
    supabase: args.supabase,
    subscriptionId: args.subscription.id,
    outcome: "triggered",
    reason: "threshold_crossed",
    snapshotJson: message.snapshot,
  });

  if (run.error || !run.data) {
    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "error",
      reason: run.error ?? "failed_to_record_run",
      summaryText: args.subscription.summary_text,
      currentValue,
      thresholdValue: args.subscription.threshold_value,
    };
  }

  const delivery = await deliverToSubscriptionTarget({ subscription: args.subscription, text: message.text });
  await recordDelivery({
    supabase: args.supabase,
    subscriptionRunId: run.data.id,
    channel: delivery.channel,
    target: delivery.target,
    deliveryStatus: delivery.status,
    externalMessageId: delivery.externalMessageId,
    errorText: delivery.errorText,
  });
  await updateSubscriptionTimestamps({
    supabase: args.supabase,
    subscriptionId: args.subscription.id,
    lastEvaluatedAt: nowIso,
    lastTriggeredAt: delivery.status === "delivered" ? nowIso : null,
  });

  return {
    subscriptionId: args.subscription.id,
    projectId: args.subscription.project_id,
    subscriptionType: args.subscription.subscription_type,
    outcome: delivery.status === "delivered" ? "triggered" : "error",
    reason: delivery.status === "delivered" ? "threshold_crossed" : (delivery.errorText ?? "delivery_failed"),
    summaryText: message.text,
    currentValue,
    thresholdValue: args.subscription.threshold_value,
    delivery,
  };
}

async function evaluateDigestSubscription(args: {
  supabase: any;
  subscription: EvaluatableProjectSubscription;
  context: ProjectCopilotContext;
  previousRun: SubscriptionRunRow | null;
  now: Date;
  dryRun?: boolean;
  force?: boolean;
}): Promise<SubscriptionEvaluationResult> {
  const due = isDigestDue({
    scheduleCron: args.subscription.schedule_cron,
    lastTriggeredAt: args.subscription.last_triggered_at,
    now: args.now,
    force: args.force,
  });

  if (!due) {
    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "skipped",
      reason: "digest_not_due",
      summaryText: args.subscription.summary_text,
    };
  }

  const recentExpenseActivity = await fetchRecentExpenseActivity({
    supabase: args.supabase,
    projectId: args.subscription.project_id,
    since: args.subscription.last_triggered_at,
  });

  if (recentExpenseActivity.error || !recentExpenseActivity.data) {
    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "error",
      reason: recentExpenseActivity.error ?? "failed_to_load_expenses",
      summaryText: args.subscription.summary_text,
    };
  }

  const digest = buildDigestMessage({
    subscription: args.subscription,
    context: args.context,
    previousSnapshot: args.previousRun?.snapshot_json,
    recentExpenses: recentExpenseActivity.data,
  });

  if (args.dryRun) {
    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "would_trigger",
      reason: "digest_due",
      summaryText: digest.text,
      delivery: {
        channel: args.subscription.channel,
        target: typeof args.subscription.target_json?.slack_user_id === "string" ? args.subscription.target_json.slack_user_id : args.subscription.created_by_email,
        status: "would_deliver",
      },
    };
  }

  const nowIso = args.now.toISOString();
  const run = await recordRun({
    supabase: args.supabase,
    subscriptionId: args.subscription.id,
    outcome: "triggered",
    reason: "digest_due",
    snapshotJson: digest.snapshot,
  });

  if (run.error || !run.data) {
    return {
      subscriptionId: args.subscription.id,
      projectId: args.subscription.project_id,
      subscriptionType: args.subscription.subscription_type,
      outcome: "error",
      reason: run.error ?? "failed_to_record_run",
      summaryText: args.subscription.summary_text,
    };
  }

  const delivery = await deliverToSubscriptionTarget({ subscription: args.subscription, text: digest.text });
  await recordDelivery({
    supabase: args.supabase,
    subscriptionRunId: run.data.id,
    channel: delivery.channel,
    target: delivery.target,
    deliveryStatus: delivery.status,
    externalMessageId: delivery.externalMessageId,
    errorText: delivery.errorText,
  });
  await updateSubscriptionTimestamps({
    supabase: args.supabase,
    subscriptionId: args.subscription.id,
    lastEvaluatedAt: nowIso,
    lastTriggeredAt: delivery.status === "delivered" ? nowIso : null,
  });

  return {
    subscriptionId: args.subscription.id,
    projectId: args.subscription.project_id,
    subscriptionType: args.subscription.subscription_type,
    outcome: delivery.status === "delivered" ? "triggered" : "error",
    reason: delivery.status === "delivered" ? "digest_due" : (delivery.errorText ?? "delivery_failed"),
    summaryText: digest.text,
    delivery,
  };
}

export async function evaluateProjectSubscriptions(args: {
  supabase: any;
  now?: Date;
  dryRun?: boolean;
  force?: boolean;
  projectId?: string | null;
  subscriptionId?: string | null;
}) {
  const now = args.now ?? new Date();
  let query = args.supabase
    .from("project_subscriptions")
    .select("id, project_id, created_by_email, channel, target_json, subscription_type, metric_key, condition_operator, threshold_value, rule_json, schedule_cron, status, cooldown_minutes, last_evaluated_at, last_triggered_at, summary_text, created_at, updated_at")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (args.projectId) query = query.eq("project_id", args.projectId);
  if (args.subscriptionId) query = query.eq("id", args.subscriptionId);

  const { data, error } = await query;
  if (error) {
    return { results: [] as SubscriptionEvaluationResult[], error: error.message };
  }

  const results: SubscriptionEvaluationResult[] = [];

  for (const subscription of (data ?? []) as EvaluatableProjectSubscription[]) {
    const context = await fetchProjectCopilotContext(args.supabase, subscription.project_id);
    if (context.error || !context.data) {
      results.push({
        subscriptionId: subscription.id,
        projectId: subscription.project_id,
        subscriptionType: subscription.subscription_type,
        outcome: "error",
        reason: context.error ?? "failed_to_load_project_context",
        summaryText: subscription.summary_text,
      });
      continue;
    }

    const previousRun = await fetchLatestRun(args.supabase, subscription.id);
    if (previousRun.error) {
      results.push({
        subscriptionId: subscription.id,
        projectId: subscription.project_id,
        subscriptionType: subscription.subscription_type,
        outcome: "error",
        reason: previousRun.error,
        summaryText: subscription.summary_text,
      });
      continue;
    }

    if (subscription.subscription_type === "metric_threshold_alert") {
      results.push(await evaluateThresholdSubscription({
        supabase: args.supabase,
        subscription,
        context: context.data,
        previousRun: previousRun.data,
        now,
        dryRun: args.dryRun,
      }));
      continue;
    }

    results.push(await evaluateDigestSubscription({
      supabase: args.supabase,
      subscription,
      context: context.data,
      previousRun: previousRun.data,
      now,
      dryRun: args.dryRun,
      force: args.force,
    }));
  }

  return { results, error: null };
}
