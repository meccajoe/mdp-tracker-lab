import { buildSubscriptionScopeLabel, type SubscriptionScopeType } from "@/lib/project-subscriptions";
import { getSavedPortfolioBySlug } from "@/lib/project-saved-portfolios";

export type PortfolioProjectSnapshot = {
  id: string;
  name: string;
  pm: string | null;
  status: string | null;
  total_budget: number;
  total_spent: number;
  qbo_total_hours: number;
  budget_hrs: number | null;
  due_date: string | null;
};

export async function lookupUserPmInitials(args: {
  supabase: any;
  email: string;
}) {
  const { data, error } = await args.supabase
    .from("user_roles")
    .select("pm_initials")
    .eq("email", args.email.toLowerCase())
    .maybeSingle();

  if (error) {
    return { pmInitials: null as string | null, error: error.message };
  }

  return {
    pmInitials: typeof data?.pm_initials === "string" ? data.pm_initials : null,
    error: null,
  };
}

async function resolveSavedPortfolioProjectIds(args: {
  supabase: any;
  createdByEmail: string;
  scopeJson?: Record<string, unknown> | null;
}) {
  const portfolioSlug = typeof args.scopeJson?.portfolio_slug === "string" ? args.scopeJson.portfolio_slug : null;
  if (!portfolioSlug) {
    return { data: [] as string[], error: "Saved portfolio slug is required." };
  }

  const portfolio = await getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: args.createdByEmail,
    slug: portfolioSlug,
  });
  if (portfolio.error) {
    return { data: [] as string[], error: portfolio.error };
  }
  if (!portfolio.data) {
    return { data: [] as string[], error: `Saved portfolio ${portfolioSlug} was not found.` };
  }
  return { data: portfolio.data.project_ids ?? [], error: null };
}

export async function resolvePortfolioProjects(args: {
  supabase: any;
  scopeType: SubscriptionScopeType;
  scopeJson?: Record<string, unknown> | null;
  createdByEmail: string;
}) {
  if (!args.scopeType || args.scopeType === "project") {
    return { data: [] as PortfolioProjectSnapshot[], error: "Portfolio scope required" };
  }

  let pmInitials: string | null = null;
  let exactProjectIds: string[] | null = null;
  if (args.scopeType === "my_active_projects") {
    const resolved = await lookupUserPmInitials({ supabase: args.supabase, email: args.createdByEmail });
    if (resolved.error) {
      return { data: [] as PortfolioProjectSnapshot[], error: resolved.error };
    }
    pmInitials = resolved.pmInitials;
    if (!pmInitials) {
      return { data: [] as PortfolioProjectSnapshot[], error: `No PM initials are mapped for ${args.createdByEmail}.` };
    }
  } else if (args.scopeType === "pm_active_projects") {
    pmInitials = typeof args.scopeJson?.pm_initials === "string" ? String(args.scopeJson.pm_initials).toUpperCase() : null;
    if (!pmInitials) {
      return { data: [] as PortfolioProjectSnapshot[], error: "PM initials are required for this portfolio scope." };
    }
  } else if (args.scopeType === "saved_portfolio") {
    const saved = await resolveSavedPortfolioProjectIds({
      supabase: args.supabase,
      createdByEmail: args.createdByEmail,
      scopeJson: args.scopeJson,
    });
    if (saved.error) {
      return { data: [] as PortfolioProjectSnapshot[], error: saved.error };
    }
    exactProjectIds = saved.data;
    if (exactProjectIds.length === 0) {
      return { data: [] as PortfolioProjectSnapshot[], error: "Saved portfolio has no projects yet." };
    }
  }

  let query = args.supabase
    .from("project_summary")
    .select("id, name, pm, status, total_budget, total_spent, qbo_total_hours, budget_hrs, due_date")
    .eq("status", "Active")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (pmInitials) {
    query = query.eq("pm", pmInitials);
  }
  if (exactProjectIds) {
    query = query.in("id", exactProjectIds);
  }

  const { data, error } = await query;
  if (error) {
    return { data: [] as PortfolioProjectSnapshot[], error: error.message };
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? row.id),
    pm: typeof row.pm === "string" ? row.pm : null,
    status: typeof row.status === "string" ? row.status : null,
    total_budget: typeof row.total_budget === "number" ? row.total_budget : Number(row.total_budget ?? 0) || 0,
    total_spent: typeof row.total_spent === "number" ? row.total_spent : Number(row.total_spent ?? 0) || 0,
    qbo_total_hours: typeof row.qbo_total_hours === "number" ? row.qbo_total_hours : Number(row.qbo_total_hours ?? 0) || 0,
    budget_hrs: typeof row.budget_hrs === "number" ? row.budget_hrs : Number(row.budget_hrs ?? 0) || null,
    due_date: typeof row.due_date === "string" ? row.due_date : null,
  }));

  if (exactProjectIds) {
    const order = new Map(exactProjectIds.map((projectId, index) => [projectId, index]));
    rows.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }

  return { data: rows, error: null };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatHours(value: number) {
  return Number.isInteger(value) ? `${value.toLocaleString()} hrs` : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} hrs`;
}

function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

export function buildPortfolioDigestText(args: {
  scopeType: SubscriptionScopeType;
  scopeJson?: Record<string, unknown> | null;
  summaryText: string;
  projects: PortfolioProjectSnapshot[];
  previousSnapshot?: Record<string, unknown> | null;
}) {
  const scopeLabel = buildSubscriptionScopeLabel(args.scopeType, args.scopeJson ?? {});
  const totalBudget = args.projects.reduce((sum, project) => sum + project.total_budget, 0);
  const totalSpent = args.projects.reduce((sum, project) => sum + project.total_spent, 0);
  const totalHours = args.projects.reduce((sum, project) => sum + project.qbo_total_hours, 0);
  const overBudget = args.projects.filter((project) => project.total_budget > 0 && project.total_spent > project.total_budget);
  const nearingBudget = args.projects
    .filter((project) => project.total_budget > 0 && project.total_spent <= project.total_budget && (project.total_spent / project.total_budget) >= 0.85)
    .sort((a, b) => (b.total_spent / Math.max(b.total_budget, 1)) - (a.total_spent / Math.max(a.total_budget, 1)))
    .slice(0, 5);
  const highestSpend = [...args.projects]
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, 5);

  const previousProjects = ((args.previousSnapshot?.projects ?? []) as Array<Record<string, unknown>>)
    .reduce<Record<string, { total_spent: number; qbo_total_hours: number }>>((acc, row) => {
      const id = typeof row.id === "string" ? row.id : null;
      if (!id) return acc;
      acc[id] = {
        total_spent: typeof row.total_spent === "number" ? row.total_spent : Number(row.total_spent ?? 0) || 0,
        qbo_total_hours: typeof row.qbo_total_hours === "number" ? row.qbo_total_hours : Number(row.qbo_total_hours ?? 0) || 0,
      };
      return acc;
    }, {});

  const changedProjects = args.projects
    .map((project) => {
      const previous = previousProjects[project.id];
      return {
        project,
        spendDelta: project.total_spent - (previous?.total_spent ?? 0),
        hoursDelta: project.qbo_total_hours - (previous?.qbo_total_hours ?? 0),
      };
    })
    .filter((row) => row.spendDelta !== 0 || row.hoursDelta !== 0)
    .sort((a, b) => Math.abs(b.spendDelta) - Math.abs(a.spendDelta) || Math.abs(b.hoursDelta) - Math.abs(a.hoursDelta))
    .slice(0, 5);

  const lines = [
    `📬 Portfolio digest — ${scopeLabel}`,
    args.summaryText,
    "",
    `• Active projects: ${args.projects.length}`,
    `• Total portfolio spend: ${formatCurrency(totalSpent)}`,
    `• Total portfolio budget: ${formatCurrency(totalBudget)}`,
    `• Total labor hours: ${formatHours(totalHours)}`,
    "",
    "Projects needing attention",
    ...(overBudget.length > 0
      ? overBudget.slice(0, 5).map((project) => `• ${project.id} — ${project.name}: ${formatCurrency(project.total_spent)} on ${formatCurrency(project.total_budget)} budget`)
      : nearingBudget.length > 0
        ? nearingBudget.map((project) => `• ${project.id} — ${project.name}: ${Math.round((project.total_spent / Math.max(project.total_budget, 1)) * 100)}% of budget used`)
        : ["• No active projects are currently at or above 85% of budget."]),
    "",
    "Biggest changes since last digest",
    ...(changedProjects.length > 0
      ? changedProjects.map(({ project, spendDelta, hoursDelta }) => `• ${project.id} — ${project.name}: spend ${spendDelta >= 0 ? "+" : ""}${formatCurrency(spendDelta)}, labor ${hoursDelta >= 0 ? "+" : ""}${formatHours(hoursDelta)}`)
      : ["• First digest run — no prior portfolio snapshot yet."]),
    "",
    "Highest spend projects",
    ...(highestSpend.length > 0
      ? highestSpend.map((project) => `• ${project.id} — ${project.name}: ${formatCurrency(project.total_spent)} spent, ${formatHours(project.qbo_total_hours)}`)
      : ["• No active projects found for this scope."]),
  ];

  return {
    text: lines.join("\n"),
    snapshot: {
      projects: args.projects.map((project) => ({
        id: project.id,
        total_spent: project.total_spent,
        qbo_total_hours: project.qbo_total_hours,
      })),
      total_budget: totalBudget,
      total_spent: totalSpent,
      total_hours: totalHours,
      project_count: args.projects.length,
    },
  };
}

export function buildPortfolioThresholdAlertText(args: {
  scopeType: SubscriptionScopeType;
  scopeJson?: Record<string, unknown> | null;
  summaryText: string;
  metricKey: string | null;
  thresholdValue: number | null;
  matchingProjects: Array<PortfolioProjectSnapshot & { currentValue: number }>;
}) {
  const scopeLabel = buildSubscriptionScopeLabel(args.scopeType, args.scopeJson ?? {});
  const metricLabel = args.metricKey === "labor_budget_pct"
    ? "labor budget"
    : args.metricKey === "budget_variance_pct"
      ? "budget variance"
      : "portfolio metric";

  const lines = [
    `🔔 Portfolio alert — ${scopeLabel}`,
    args.summaryText,
    "",
    `• Matching projects: ${args.matchingProjects.length}`,
    ...(args.thresholdValue != null ? [`• Threshold: ${args.metricKey === "labor_budget_pct" || args.metricKey === "budget_variance_pct" ? formatPercent(args.thresholdValue) : String(args.thresholdValue)}`] : []),
    "",
    ...args.matchingProjects.slice(0, 10).map((project) => {
      const formattedValue = args.metricKey === "labor_budget_pct" || args.metricKey === "budget_variance_pct"
        ? formatPercent(project.currentValue)
        : formatCurrency(project.currentValue);
      return `• ${project.id} — ${project.name}: ${metricLabel} ${formattedValue}`;
    }),
  ];

  return {
    text: lines.join("\n"),
    snapshot: {
      matching_project_ids: args.matchingProjects.map((project) => project.id),
      metric_key: args.metricKey,
      threshold_value: args.thresholdValue,
      project_count: args.matchingProjects.length,
    },
  };
}
