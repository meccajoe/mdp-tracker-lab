import type { ThresholdRecommendationInput } from "./project-subscriptions.ts";

export type PortfolioMonitorKey =
  | "labor_budget_95"
  | "labor_budget_100"
  | "total_budget_90"
  | "total_budget_100"
  | "total_budget_overrun"
  | "budget_materials_90"
  | "budget_materials_100"
  | "budget_travel_100";

type PortfolioMonitorConfig = {
  key: PortfolioMonitorKey;
  label: string;
  metricKey: ThresholdRecommendationInput["metricKey"];
  scopeKey: string;
  unit: ThresholdRecommendationInput["unit"];
  thresholdValue: number;
  message: string;
};

export const PORTFOLIO_MONITOR_CONFIG: Record<PortfolioMonitorKey, PortfolioMonitorConfig> = {
  labor_budget_95: {
    key: "labor_budget_95",
    label: "Labor reaches 95% of budget",
    metricKey: "labor_budget_pct",
    scopeKey: "budget_hrs",
    unit: "percent",
    thresholdValue: 95,
    message: "Alert when a saved-portfolio project selected for labor monitoring reaches 95% of labor budget.",
  },
  labor_budget_100: {
    key: "labor_budget_100",
    label: "Labor reaches 100% of budget",
    metricKey: "labor_budget_pct",
    scopeKey: "budget_hrs",
    unit: "percent",
    thresholdValue: 100,
    message: "Alert when a saved-portfolio project selected for labor monitoring fully consumes labor budget.",
  },
  total_budget_90: {
    key: "total_budget_90",
    label: "Total budget reaches 90%",
    metricKey: "budget_utilization_pct",
    scopeKey: "total_budget",
    unit: "percent",
    thresholdValue: 90,
    message: "Alert when a saved-portfolio project selected for total-budget monitoring reaches 90% of total budget.",
  },
  total_budget_100: {
    key: "total_budget_100",
    label: "Total budget reaches 100%",
    metricKey: "budget_utilization_pct",
    scopeKey: "total_budget",
    unit: "percent",
    thresholdValue: 100,
    message: "Alert when a saved-portfolio project selected for total-budget monitoring reaches 100% of total budget.",
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
  budget_materials_90: {
    key: "budget_materials_90",
    label: "Fabrication reaches 90% of budget",
    metricKey: "budget_utilization_pct",
    scopeKey: "budget_materials",
    unit: "percent",
    thresholdValue: 90,
    message: "Alert when a saved-portfolio project selected for fabrication monitoring reaches 90% of fabrication budget.",
  },
  budget_materials_100: {
    key: "budget_materials_100",
    label: "Fabrication reaches 100% of budget",
    metricKey: "budget_utilization_pct",
    scopeKey: "budget_materials",
    unit: "percent",
    thresholdValue: 100,
    message: "Alert when a saved-portfolio project selected for fabrication monitoring reaches 100% of fabrication budget.",
  },
  budget_travel_100: {
    key: "budget_travel_100",
    label: "Travel reaches 100% of budget",
    metricKey: "budget_utilization_pct",
    scopeKey: "budget_travel",
    unit: "percent",
    thresholdValue: 100,
    message: "Alert when a saved-portfolio project selected for travel monitoring reaches 100% of travel budget.",
  },
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
    basisLabel: "Percent of budget",
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
