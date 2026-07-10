export type SubscriptionStatus = "active" | "paused" | "archived";
export type SubscriptionAction = "pause" | "resume" | "delete";
export type SubscriptionType = "metric_threshold_alert" | "scheduled_digest";

export type ThresholdRecommendationInput = {
  type: "threshold";
  metricKey: string;
  scopeKey: string;
  unit: "hours" | "currency" | "percent";
  currentValue: number | null;
  basisValue: number;
  basisLabel: string;
  spotlight: { id: string; label: string; threshold: number };
  options: Array<{ id: string; label: string; threshold: number }>;
  message: string;
};

export type DigestRecommendationInput = {
  type: "digest";
  digestKey: string;
  defaultSections: string[];
  message: string;
};

export type RecommendationInput = ThresholdRecommendationInput | DigestRecommendationInput;

export type ProjectSubscriptionRecord = {
  project_id: string;
  created_by_email: string;
  channel: "mdp_tracker" | "slack_dm";
  target_json: Record<string, unknown>;
  subscription_type: SubscriptionType;
  metric_key: string | null;
  condition_operator: string | null;
  threshold_value: number | null;
  rule_json: Record<string, unknown>;
  schedule_cron: string | null;
  status: SubscriptionStatus;
  cooldown_minutes: number;
  summary_text: string;
};

function formatThresholdValue(value: number, unit: "hours" | "currency" | "percent") {
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (unit === "percent") {
    return `${value}%`;
  }
  return `${value} hrs`;
}

function labelMetric(metricKey: string) {
  switch (metricKey) {
    case "qbo_total_hours":
      return "labor hours";
    case "category_actual_spend":
      return "category spend";
    case "total_spent":
      return "total spend";
    case "budget_variance_pct":
      return "budget variance";
    default:
      return metricKey;
  }
}

function labelScope(scopeKey: string) {
  switch (scopeKey) {
    case "budget_hrs":
      return "labor";
    case "budget_materials":
      return "fabrication";
    case "budget_design":
      return "design";
    case "budget_pm":
      return "project management";
    case "budget_shipping":
      return "shipping";
    case "budget_id_labor":
      return "I&D labor";
    case "budget_travel":
      return "travel";
    case "budget_props":
      return "props/decor";
    case "budget_equipment":
      return "equipment";
    case "budget_rental":
      return "rental";
    case "budget_crating":
      return "crating";
    case "budget_flooring":
      return "flooring";
    case "total_budget":
      return "project";
    default:
      return scopeKey;
  }
}

export function buildSubscriptionSummary(input: {
  subscription_type: SubscriptionType;
  metric_key: string | null;
  condition_operator: string | null;
  threshold_value: number | null;
  schedule_cron: string | null;
  rule_json: Record<string, unknown>;
}) {
  if (input.subscription_type === "scheduled_digest") {
    if (input.schedule_cron === "0 16 * * 1-5") {
      return "Weekday 4pm project digest";
    }
    return "Project digest";
  }

  if (!input.metric_key || input.threshold_value == null || input.condition_operator == null) {
    return "Project alert";
  }

  const unit = (input.rule_json.unit as "hours" | "currency" | "percent" | undefined) ?? "hours";
  const scopePrefix = input.metric_key === "category_actual_spend" || input.metric_key === "budget_variance_pct"
    ? `${labelScope(String(input.rule_json.scopeKey ?? ""))} `
    : "";

  return `Alert when ${scopePrefix}${labelMetric(input.metric_key)} ${input.condition_operator} ${formatThresholdValue(input.threshold_value, unit)}`
    .replace(" >= ", " reach ")
    .replace(" <= ", " drop to ");
}

export function buildSubscriptionCreatePayload(args: {
  projectId: string;
  createdByEmail: string;
  recommendation: RecommendationInput;
  channel?: ProjectSubscriptionRecord["channel"];
  targetJson?: Record<string, unknown>;
}): ProjectSubscriptionRecord {
  const base = {
    project_id: args.projectId,
    created_by_email: args.createdByEmail,
    channel: args.channel ?? ("mdp_tracker" as const),
    target_json: args.targetJson ?? { surface: "project_modal" },
    status: "active" as const,
    cooldown_minutes: 60,
  };

  if (args.recommendation.type === "digest") {
    const record: ProjectSubscriptionRecord = {
      ...base,
      subscription_type: "scheduled_digest",
      metric_key: null,
      condition_operator: null,
      threshold_value: null,
      schedule_cron: "0 16 * * 1-5",
      rule_json: {
        digestKey: args.recommendation.digestKey,
        sections: args.recommendation.defaultSections,
      },
      summary_text: "Weekday 4pm project digest",
    };
    record.summary_text = buildSubscriptionSummary(record);
    return record;
  }

  const thresholdRecord: ProjectSubscriptionRecord = {
    ...base,
    subscription_type: "metric_threshold_alert",
    metric_key: args.recommendation.metricKey,
    condition_operator: ">=",
    threshold_value: args.recommendation.spotlight.threshold,
    schedule_cron: null,
    rule_json: {
      unit: args.recommendation.unit,
      scopeKey: args.recommendation.scopeKey,
      optionId: args.recommendation.spotlight.id,
      basisValue: args.recommendation.basisValue,
    },
    summary_text: "",
  };
  thresholdRecord.summary_text = buildSubscriptionSummary(thresholdRecord);
  return thresholdRecord;
}

export function getNextStatusForAction(action: SubscriptionAction): SubscriptionStatus {
  switch (action) {
    case "pause":
      return "paused";
    case "resume":
      return "active";
    case "delete":
      return "archived";
  }
}
