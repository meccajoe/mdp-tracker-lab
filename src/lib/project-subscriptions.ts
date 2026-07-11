export type SubscriptionStatus = "active" | "paused" | "archived";
export type SubscriptionAction = "pause" | "resume" | "delete";
export type SubscriptionType = "metric_threshold_alert" | "scheduled_digest";
export type SubscriptionScopeType = "project" | "my_active_projects" | "pm_active_projects" | "all_active_projects";

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
  project_id: string | null;
  created_by_email: string;
  channel: "mdp_tracker" | "slack_dm";
  target_json: Record<string, unknown>;
  subscription_type: SubscriptionType;
  scope_type: SubscriptionScopeType;
  scope_json: Record<string, unknown>;
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

export function buildSubscriptionScopeLabel(scopeType: SubscriptionScopeType, scopeJson: Record<string, unknown> = {}) {
  switch (scopeType) {
    case "project": {
      const projectId = typeof scopeJson.project_id === "string" ? scopeJson.project_id : null;
      return projectId ? `project ${projectId}` : "project";
    }
    case "my_active_projects":
      return "my active projects";
    case "pm_active_projects": {
      const pmInitials = typeof scopeJson.pm_initials === "string" ? scopeJson.pm_initials : null;
      return pmInitials ? `${pmInitials} active projects` : "PM active projects";
    }
    case "all_active_projects":
      return "all active projects";
    default:
      return "portfolio";
  }
}

export function buildSubscriptionSummary(input: {
  subscription_type: SubscriptionType;
  scope_type?: SubscriptionScopeType;
  scope_json?: Record<string, unknown>;
  metric_key: string | null;
  condition_operator: string | null;
  threshold_value: number | null;
  schedule_cron: string | null;
  rule_json: Record<string, unknown>;
}) {
  const scopeType = input.scope_type ?? "project";
  const scopeLabel = buildSubscriptionScopeLabel(scopeType, input.scope_json ?? {});

  if (input.subscription_type === "scheduled_digest") {
    if (input.schedule_cron === "0 16 * * 1-5") {
      return scopeType === "project"
        ? "Weekday 4pm project digest"
        : `Weekday 4pm portfolio digest — ${scopeLabel}`;
    }
    return scopeType === "project" ? "Project digest" : `Portfolio digest — ${scopeLabel}`;
  }

  if (!input.metric_key || input.threshold_value == null || input.condition_operator == null) {
    return scopeType === "project" ? "Project alert" : `Portfolio alert — ${scopeLabel}`;
  }

  const unit = (input.rule_json.unit as "hours" | "currency" | "percent" | undefined) ?? "hours";
  const scopePrefix = input.metric_key === "category_actual_spend" || input.metric_key === "budget_variance_pct"
    ? `${labelScope(String(input.rule_json.scopeKey ?? ""))} `
    : "";
  const subject = scopeType === "project" ? "" : `${scopeLabel} `;

  return `Alert when ${subject}${scopePrefix}${labelMetric(input.metric_key)} ${input.condition_operator} ${formatThresholdValue(input.threshold_value, unit)}`
    .replace(" >= ", " reach ")
    .replace(" <= ", " drop to ");
}

export function buildSubscriptionCreatePayload(args: {
  projectId?: string | null;
  createdByEmail: string;
  recommendation: RecommendationInput;
  channel?: ProjectSubscriptionRecord["channel"];
  targetJson?: Record<string, unknown>;
  scopeType?: SubscriptionScopeType;
  scopeJson?: Record<string, unknown>;
}): ProjectSubscriptionRecord {
  const scopeType = args.scopeType ?? "project";
  const scopeJson = args.scopeJson ?? (scopeType === "project" && args.projectId ? { project_id: args.projectId } : {});
  const base = {
    project_id: scopeType === "project" ? (args.projectId ?? null) : null,
    created_by_email: args.createdByEmail,
    channel: args.channel ?? ("mdp_tracker" as const),
    target_json: args.targetJson ?? { surface: "project_modal" },
    scope_type: scopeType,
    scope_json: scopeJson,
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
