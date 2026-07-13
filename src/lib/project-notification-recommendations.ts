export type RecommendationProjectFacts = {
  id: string;
  name: string;
  budget_hrs: number | null;
  qbo_total_hours: number;
  total_budget: number;
  total_spent: number;
  budget_materials: number | null;
  budget_design: number | null;
  budget_pm: number | null;
  budget_shipping: number | null;
  budget_id_labor: number | null;
  budget_travel: number | null;
  budget_props: number | null;
  budget_equipment: number | null;
  budget_rental: number | null;
  budget_crating: number | null;
  budget_flooring: number | null;
};

export type ThresholdOption = {
  id: string;
  label: string;
  threshold: number;
};

export type ThresholdRecommendation = {
  type: "threshold";
  metricKey: "qbo_total_hours" | "category_actual_spend" | "total_spent" | "budget_variance_pct";
  scopeKey: string;
  unit: "hours" | "currency" | "percent";
  currentValue: number | null;
  basisValue: number;
  basisLabel: string;
  spotlight: ThresholdOption;
  options: ThresholdOption[];
  message: string;
};

export type DigestRecommendation = {
  type: "digest";
  digestKey: "daily_pm";
  defaultSections: string[];
  message: string;
};

export type ClarifyRecommendation = {
  type: "clarify";
  message: string;
};

export type ProjectNotificationRecommendation =
  | ThresholdRecommendation
  | DigestRecommendation
  | ClarifyRecommendation;

export const CATEGORY_SCOPE_CONFIG = {
  budget_materials: {
    label: "Fabrication",
    aliases: ["fabrication", "materials", "material"],
    expenseCategories: ["Fabrication", "Fab Supplies and Small Equipment"],
  },
  budget_design: {
    label: "Design",
    aliases: ["design"],
    expenseCategories: ["Design", "Design Labor", "Design, Engineering, CAD"],
  },
  budget_pm: {
    label: "Project Management",
    aliases: ["pm", "project management", "management"],
    expenseCategories: ["Project Management", "Admin", "Show Prep"],
  },
  budget_shipping: {
    label: "Shipping",
    aliases: ["shipping", "freight", "trucking"],
    expenseCategories: ["Shipping", "Shipping/Trucking", "Fuel Costs", "Storage"],
  },
  budget_id_labor: {
    label: "I&D Labor",
    aliases: ["i&d", "install", "strike", "install/strike"],
    expenseCategories: ["Install/Strike", "I&D Labor"],
  },
  budget_travel: {
    label: "Travel",
    aliases: ["travel", "hotel", "airfare", "per diem"],
    expenseCategories: ["Travel", "Travel-Hotels", "Travel-Per Diem", "Travel-Airfare & Baggage Fees", "Production Meals"],
  },
  budget_props: {
    label: "Props/Decor",
    aliases: ["props", "decor"],
    expenseCategories: ["Props/Decor"],
  },
  budget_equipment: {
    label: "Equipment",
    aliases: ["equipment", "forklift", "show services"],
    expenseCategories: ["On-site Show Services", "Forklifts and Trucks", "Machinery Repairs & Maintenance"],
  },
  budget_rental: {
    label: "Rental",
    aliases: ["rental"],
    expenseCategories: ["Rental"],
  },
  budget_crating: {
    label: "Crating",
    aliases: ["crating", "crate"],
    expenseCategories: ["Custom Crating"],
  },
  budget_flooring: {
    label: "Flooring",
    aliases: ["flooring", "graphics"],
    expenseCategories: ["Graphics"],
  },
} as const;

export type CategoryScopeKey = keyof typeof CATEGORY_SCOPE_CONFIG;

export type BuildRecommendationInput = {
  requestText: string;
  project: RecommendationProjectFacts;
  categoryActuals: Partial<Record<CategoryScopeKey, number>>;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function matchesThresholdIntent(requestText: string) {
  return /(too high|gets too high|getting high|warn|watch|exceeds?|exceeded|above|over|passes?|hits?|reaches?|gets to)/.test(requestText);
}

function extractExplicitPercentThreshold(requestText: string) {
  const match = requestText.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function roundHours(value: number) {
  if (value >= 20) return Math.round(value);
  return Math.round(value * 2) / 2;
}

function roundCurrency(value: number) {
  return Math.round(value / 100) * 100;
}

function buildHoursThresholdOptions(basisValue: number): ThresholdOption[] {
  return [
    { id: "heads_up", label: "Heads-up", threshold: roundHours(basisValue * 0.8) },
    { id: "warning", label: "Warning", threshold: roundHours(basisValue * 0.95) },
    { id: "over_budget", label: "Over budget", threshold: roundHours(basisValue) },
    { id: "critical", label: "Critical overrun", threshold: roundHours(basisValue * 1.1) },
  ];
}

function buildCurrencyThresholdOptions(basisValue: number): ThresholdOption[] {
  return [
    { id: "heads_up", label: "Heads-up", threshold: roundCurrency(basisValue * 0.85) },
    { id: "at_budget", label: "At budget", threshold: roundCurrency(basisValue) },
    { id: "over_budget", label: "Over budget", threshold: roundCurrency(basisValue * 1.1) },
  ];
}

function buildVarianceThresholdOptions(): ThresholdOption[] {
  return [
    { id: "soft_warning", label: "Soft warning", threshold: 5 },
    { id: "warning", label: "Warning", threshold: 10 },
    { id: "critical", label: "Critical", threshold: 20 },
  ];
}

function buildCustomThresholdOption(percent: number, threshold: number): ThresholdOption {
  return {
    id: `custom_${String(percent).replace(/\./g, "_")}`,
    label: `Custom (${percent}%)`,
    threshold,
  };
}

function mergeSpotlightWithOptions(spotlight: ThresholdOption, defaults: ThresholdOption[]) {
  return [spotlight, ...defaults.filter((option) => option.threshold !== spotlight.threshold)];
}

function findCategoryScopeKey(requestText: string): CategoryScopeKey | null {
  for (const [scopeKey, config] of Object.entries(CATEGORY_SCOPE_CONFIG) as Array<[CategoryScopeKey, (typeof CATEGORY_SCOPE_CONFIG)[CategoryScopeKey]]>) {
    if (config.aliases.some((alias) => requestText.includes(alias))) {
      return scopeKey;
    }
  }
  return null;
}

function buildLaborRecommendation(project: RecommendationProjectFacts): ProjectNotificationRecommendation {
  if (!project.budget_hrs || project.budget_hrs <= 0) {
    return {
      type: "clarify",
      message: "I can’t recommend a budget-based labor threshold because this project doesn’t have a labor budget yet. I can still create a custom hour threshold if you want.",
    };
  }

  const options = buildHoursThresholdOptions(project.budget_hrs);
  const spotlight = options.find((option) => option.id === "warning") ?? options[0];
  return {
    type: "threshold",
    metricKey: "qbo_total_hours",
    scopeKey: "budget_hrs",
    unit: "hours",
    currentValue: project.qbo_total_hours,
    basisValue: project.budget_hrs,
    basisLabel: "Labor budget hours",
    spotlight,
    options,
    message: `Project ${project.id} has a labor budget of ${project.budget_hrs} hours and is currently at ${project.qbo_total_hours} hours. I recommend a warning alert at ${spotlight.threshold} hours.`,
  };
}

function buildLaborRecommendationForRequest(project: RecommendationProjectFacts, requestText: string): ProjectNotificationRecommendation {
  const baseRecommendation = buildLaborRecommendation(project);
  if (baseRecommendation.type !== "threshold") {
    return baseRecommendation;
  }

  const explicitPercent = extractExplicitPercentThreshold(requestText);
  if (!explicitPercent || !/budget/.test(requestText)) {
    return baseRecommendation;
  }

  const spotlight = buildCustomThresholdOption(explicitPercent, roundHours(baseRecommendation.basisValue * (explicitPercent / 100)));
  return {
    ...baseRecommendation,
    spotlight,
    options: mergeSpotlightWithOptions(spotlight, baseRecommendation.options),
    message: `Project ${project.id} has a labor budget of ${project.budget_hrs} hours and is currently at ${project.qbo_total_hours} hours. I can create a custom alert at ${spotlight.threshold} hours (${explicitPercent}% of budget).`,
  };
}

function buildCategoryRecommendation(
  project: RecommendationProjectFacts,
  requestText: string,
  categoryActuals: Partial<Record<CategoryScopeKey, number>>
): ProjectNotificationRecommendation {
  const scopeKey = findCategoryScopeKey(requestText);
  if (!scopeKey) {
    return {
      type: "clarify",
      message: "I couldn’t tell which project category you want to watch. Try naming a category like fabrication, design, shipping, or travel.",
    };
  }

  const config = CATEGORY_SCOPE_CONFIG[scopeKey];
  const budgetValue = project[scopeKey];
  if (!budgetValue || budgetValue <= 0) {
    return {
      type: "clarify",
      message: `I can’t recommend a budget-based ${config.label.toLowerCase()} threshold because this project doesn’t have a ${config.label.toLowerCase()} budget yet. I can still create a custom dollar threshold if you want.`,
    };
  }

  const defaultOptions = buildCurrencyThresholdOptions(budgetValue);
  const explicitPercent = extractExplicitPercentThreshold(requestText);
  const customPercentRequested = !!explicitPercent && /budget/.test(requestText);
  const spotlight = customPercentRequested
    ? buildCustomThresholdOption(explicitPercent!, roundCurrency(budgetValue * (explicitPercent! / 100)))
    : (defaultOptions.find((option) => option.id === "heads_up") ?? defaultOptions[0]);

  return {
    type: "threshold",
    metricKey: "category_actual_spend",
    scopeKey,
    unit: "currency",
    currentValue: categoryActuals[scopeKey] ?? 0,
    basisValue: budgetValue,
    basisLabel: `${config.label} budget`,
    spotlight,
    options: customPercentRequested ? mergeSpotlightWithOptions(spotlight, defaultOptions) : defaultOptions,
    message: customPercentRequested
      ? `${config.label} budget is $${budgetValue.toLocaleString()}. I can create a custom alert at $${spotlight.threshold.toLocaleString()} (${explicitPercent}% of budget).`
      : `${config.label} budget is $${budgetValue.toLocaleString()}. I recommend a heads-up alert at $${spotlight.threshold.toLocaleString()} (${Math.round((spotlight.threshold / budgetValue) * 100)}%).`,
  };
}

function buildTotalSpendRecommendation(project: RecommendationProjectFacts): ProjectNotificationRecommendation {
  if (!project.total_budget || project.total_budget <= 0) {
    return {
      type: "clarify",
      message: "I can’t recommend a project-spend threshold because this project doesn’t have a usable total budget yet. I can still create a custom spend threshold if you want.",
    };
  }

  const options = buildCurrencyThresholdOptions(project.total_budget);
  const spotlight = options.find((option) => option.id === "heads_up") ?? options[0];
  return {
    type: "threshold",
    metricKey: "total_spent",
    scopeKey: "total_budget",
    unit: "currency",
    currentValue: project.total_spent,
    basisValue: project.total_budget,
    basisLabel: "Total project budget",
    spotlight,
    options,
    message: `Project ${project.id} has a total budget of $${project.total_budget.toLocaleString()} and is currently at $${project.total_spent.toLocaleString()} spent. I recommend a heads-up alert at $${spotlight.threshold.toLocaleString()}.`,
  };
}

function buildVarianceRecommendation(project: RecommendationProjectFacts, requestText: string): ProjectNotificationRecommendation {
  const scopeKey = findCategoryScopeKey(requestText);
  const options = buildVarianceThresholdOptions();
  const spotlight = options.find((option) => option.id === "warning") ?? options[0];

  if (scopeKey) {
    const config = CATEGORY_SCOPE_CONFIG[scopeKey];
    const budgetValue = project[scopeKey];
    if (!budgetValue || budgetValue <= 0) {
      return {
        type: "clarify",
        message: `I can’t recommend a ${config.label.toLowerCase()} variance alert because this project doesn’t have a ${config.label.toLowerCase()} budget yet.`,
      };
    }

    return {
      type: "threshold",
      metricKey: "budget_variance_pct",
      scopeKey,
      unit: "percent",
      currentValue: null,
      basisValue: budgetValue,
      basisLabel: `${config.label} budget variance`,
      spotlight,
      options,
      message: `I recommend a ${spotlight.threshold}% variance warning for ${config.label.toLowerCase()} because that usually catches a meaningful budget drift before it becomes a hard overrun.`,
    };
  }

  if (!project.total_budget || project.total_budget <= 0) {
    return {
      type: "clarify",
      message: "I can’t recommend an over-budget alert because this project doesn’t have a usable budget yet.",
    };
  }

  return {
    type: "threshold",
    metricKey: "budget_variance_pct",
    scopeKey: "total_budget",
    unit: "percent",
    currentValue: null,
    basisValue: project.total_budget,
    basisLabel: "Total project budget variance",
    spotlight,
    options,
    message: `I recommend a ${spotlight.threshold}% over-budget warning for the overall project budget.`,
  };
}

function buildDigestRecommendation(project: RecommendationProjectFacts): ProjectNotificationRecommendation {
  return {
    type: "digest",
    digestKey: "daily_pm",
    defaultSections: [
      "labor_hours",
      "total_spend",
      "spend_by_category",
      "top_changes",
      "flagged_expenses",
    ],
    message: `I can send a daily PM digest for project ${project.id} with labor hours, total spend, spend by category, top changes, and newly flagged expenses.`,
  };
}

export function buildProjectNotificationRecommendation(input: BuildRecommendationInput): ProjectNotificationRecommendation {
  const requestText = normalizeText(input.requestText);

  if (/keep me posted|keep us posted|updates|update me|daily|weekly|digest/.test(requestText)) {
    return buildDigestRecommendation(input.project);
  }

  if (/labor|hours/.test(requestText) && matchesThresholdIntent(requestText)) {
    return buildLaborRecommendationForRequest(input.project, requestText);
  }

  if (/variance|over budget/.test(requestText)) {
    return buildVarianceRecommendation(input.project, requestText);
  }

  const categoryScopeKey = findCategoryScopeKey(requestText);
  if (categoryScopeKey && matchesThresholdIntent(requestText)) {
    return buildCategoryRecommendation(input.project, requestText, input.categoryActuals);
  }

  if (/spend|cost/.test(requestText) && matchesThresholdIntent(requestText)) {
    return buildTotalSpendRecommendation(input.project);
  }

  return {
    type: "clarify",
    message: "I can help with labor, category spend, total spend, budget variance, or digest recommendations. Try asking for one of those directly.",
  };
}
