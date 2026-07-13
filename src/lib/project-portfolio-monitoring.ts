import { CATEGORY_SCOPE_CONFIG, type CategoryScopeKey } from "./project-notification-recommendations.ts";
import type { ThresholdRecommendationInput } from "./project-subscriptions.ts";

export type PortfolioMonitorKey =
  | "labor_budget_warning"
  | "total_budget_overrun"
  | `${CategoryScopeKey}_overrun`;

type PortfolioMonitorConfig = {
  key: PortfolioMonitorKey;
  label: string;
  metricKey: ThresholdRecommendationInput["metricKey"];
  scopeKey: string;
  unit: ThresholdRecommendationInput["unit"];
  thresholdValue: number;
  message: string;
};

const categoryMonitorConfigs = Object.fromEntries(
  (Object.entries(CATEGORY_SCOPE_CONFIG) as Array<[CategoryScopeKey, (typeof CATEGORY_SCOPE_CONFIG)[CategoryScopeKey]]>).map(([scopeKey, config]) => {
    const key = `${scopeKey}_overrun` as PortfolioMonitorKey;
    return [
      key,
      {
        key,
        label: `${config.label} over budget`,
        metricKey: "budget_variance_pct",
        scopeKey,
        unit: "percent",
        thresholdValue: 0,
        message: `Alert when a saved-portfolio project selected for ${config.label.toLowerCase()} monitoring goes over its ${config.label.toLowerCase()} budget.`,
      } satisfies PortfolioMonitorConfig,
    ];
  })
) as Record<`${CategoryScopeKey}_overrun`, PortfolioMonitorConfig>;

export const PORTFOLIO_MONITOR_CONFIG: Record<PortfolioMonitorKey, PortfolioMonitorConfig> = {
  labor_budget_warning: {
    key: "labor_budget_warning",
    label: "Labor reaches 95% of budget",
    metricKey: "labor_budget_pct",
    scopeKey: "budget_hrs",
    unit: "percent",
    thresholdValue: 95,
    message: "Alert when a saved-portfolio project selected for labor monitoring reaches 95% of labor budget.",
  },
  total_budget_overrun: {
    key: "total_budget_overrun",
    label: "Total project over budget",
    metricKey: "budget_variance_pct",
    scopeKey: "total_budget",
    unit: "percent",
    thresholdValue: 0,
    message: "Alert when a saved-portfolio project selected for total-budget monitoring goes over total budget.",
  },
  ...categoryMonitorConfigs,
};

export function listPortfolioMonitorOptions() {
  return Object.values(PORTFOLIO_MONITOR_CONFIG);
}

export function getPortfolioMonitorConfig(key: string | null | undefined) {
  if (!key) return null;
  return PORTFOLIO_MONITOR_CONFIG[key as PortfolioMonitorKey] ?? null;
}

export function normalizePortfolioMonitorKeys(keys: string[] | null | undefined): PortfolioMonitorKey[] {
  if (!Array.isArray(keys)) return [];
  const normalized = Array.from(new Set(keys.map((key) => String(key).trim()).filter(Boolean)));
  return normalized.filter((key): key is PortfolioMonitorKey => key in PORTFOLIO_MONITOR_CONFIG);
}

export function buildPortfolioMonitorRecommendation(args: {
  monitorKey: PortfolioMonitorKey;
  scopeLabel: string;
}): ThresholdRecommendationInput {
  const config = PORTFOLIO_MONITOR_CONFIG[args.monitorKey];
  return {
    type: "threshold",
    metricKey: config.metricKey,
    scopeKey: config.scopeKey,
    unit: config.unit,
    currentValue: null,
    basisValue: 100,
    basisLabel: config.unit === "percent" ? "Percent of budget" : "Budget basis",
    spotlight: {
      id: args.monitorKey,
      label: config.label,
      threshold: config.thresholdValue,
    },
    options: [
      {
        id: args.monitorKey,
        label: config.label,
        threshold: config.thresholdValue,
      },
    ],
    message: `${config.message} Scope: ${args.scopeLabel}.`,
  };
}

export function buildPortfolioMonitorScopeExtension(portfolio_monitor_key: PortfolioMonitorKey) {
  return { portfolio_monitor_key };
}
