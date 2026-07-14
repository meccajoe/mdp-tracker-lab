import { normalizePortfolioMonitorKeys, type PortfolioMonitorKey } from "./project-portfolio-monitoring.ts";

function slugifyPortfolioName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export type SavedPortfolioProjectMembership = {
  project_id: string;
  ordinal: number;
  monitor_keys: PortfolioMonitorKey[];
  project_name?: string | null;
  client_name?: string | null;
};

export type PortfolioAutomationRuleType = "manual" | "pm_active_projects" | "all_active_projects";

export type SavedPortfolioAutomation = {
  rule_type: PortfolioAutomationRuleType;
  pm_initials?: string | null;
};

export type SavedPortfolioRow = {
  id: string;
  created_by_email: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  automation: SavedPortfolioAutomation;
  project_ids?: string[];
  projects?: SavedPortfolioProjectMembership[];
};

function normalizePortfolioAutomation(input: Record<string, unknown> | null | undefined): SavedPortfolioAutomation {
  const ruleType = typeof input?.rule_type === "string" ? input.rule_type : "manual";
  if (ruleType === "pm_active_projects") {
    return {
      rule_type: "pm_active_projects",
      pm_initials: typeof input?.pm_initials === "string" ? input.pm_initials.trim().toUpperCase() : null,
    };
  }

  if (ruleType === "all_active_projects") {
    return {
      rule_type: "all_active_projects",
      pm_initials: null,
    };
  }

  return {
    rule_type: "manual",
    pm_initials: null,
  };
}

function parsePortfolioMemberships(rows: Array<Record<string, unknown>> | null | undefined): SavedPortfolioProjectMembership[] {
  return (rows ?? [])
    .map((item) => {
      const monitorJson = (item.monitor_json as Record<string, unknown> | null | undefined) ?? {};
      return {
        project_id: String(item.project_id),
        ordinal: Number(item.ordinal ?? 0),
        monitor_keys: normalizePortfolioMonitorKeys(monitorJson.monitor_keys as string[] | undefined),
      } satisfies SavedPortfolioProjectMembership;
    })
    .sort((a, b) => a.ordinal - b.ordinal);
}

async function fetchProjectIdentityMap(args: { supabase: any; projectIds: string[] }) {
  if (args.projectIds.length === 0) {
    return { data: {} as Record<string, { project_name: string | null; client_name: string | null }>, error: null };
  }

  const { data, error } = await args.supabase
    .from("project_summary")
    .select("id, name, client")
    .in("id", args.projectIds);

  if (error) {
    return { data: {} as Record<string, { project_name: string | null; client_name: string | null }>, error: error.message };
  }

  const map = ((data ?? []) as Array<Record<string, unknown>>).reduce<Record<string, { project_name: string | null; client_name: string | null }>>((acc, row) => {
    acc[String(row.id)] = {
      project_name: typeof row.name === "string" ? row.name : null,
      client_name: typeof row.client === "string" ? row.client : null,
    };
    return acc;
  }, {});

  return { data: map, error: null };
}

export async function listSavedPortfolios(args: {
  supabase: any;
  createdByEmail?: string | null;
}) {
  let query = args.supabase
    .from("project_portfolios")
    .select("id, created_by_email, name, slug, created_at, updated_at, automation_json, project_portfolio_projects(project_id, ordinal, monitor_json)")
    .order("updated_at", { ascending: false });

  if (args.createdByEmail) {
    query = query.eq("created_by_email", args.createdByEmail.toLowerCase());
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  const membershipRows = ((data ?? []) as Array<Record<string, unknown>>).map((row) =>
    parsePortfolioMemberships((row.project_portfolio_projects as Array<Record<string, unknown>> | null | undefined) ?? [])
  );
  const projectIds = Array.from(new Set(membershipRows.flatMap((items) => items.map((item) => item.project_id))));
  const identities = await fetchProjectIdentityMap({ supabase: args.supabase, projectIds });
  if (identities.error) {
    return { data: null, error: identities.error };
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row, index) => {
    const projects = membershipRows[index].map((membership) => ({
      ...membership,
      project_name: identities.data[membership.project_id]?.project_name ?? null,
      client_name: identities.data[membership.project_id]?.client_name ?? null,
    }));
    return {
      id: String(row.id),
      created_by_email: String(row.created_by_email),
      name: String(row.name),
      slug: String(row.slug),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      automation: normalizePortfolioAutomation((row.automation_json as Record<string, unknown> | null | undefined) ?? {}),
      projects,
      project_ids: projects.map((item) => item.project_id),
    } satisfies SavedPortfolioRow;
  });

  return { data: rows, error: null };
}

export async function getSavedPortfolioBySlug(args: {
  supabase: any;
  createdByEmail?: string | null;
  slug: string;
  ownerEmail?: string | null;
}) {
  const portfolios = await listSavedPortfolios(args);
  if (portfolios.error) {
    return { data: null, error: portfolios.error };
  }

  const ownerEmail = args.ownerEmail?.toLowerCase() ?? null;
  const row = (portfolios.data ?? []).find((portfolio) => portfolio.slug === args.slug.toLowerCase() && (!ownerEmail || portfolio.created_by_email === ownerEmail));
  return { data: row ?? null, error: null };
}

async function touchPortfolio(args: { supabase: any; portfolioId: string }) {
  await args.supabase
    .from("project_portfolios")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.portfolioId);
}

export async function upsertSavedPortfolio(args: {
  supabase: any;
  createdByEmail: string;
  name: string;
  projectIds: string[];
  automation?: SavedPortfolioAutomation;
}) {
  const slug = slugifyPortfolioName(args.name);
  if (!slug) {
    return { data: null, error: "Portfolio name is required." };
  }
  if (args.projectIds.length === 0) {
    return { data: null, error: "Add at least one project id to save a portfolio." };
  }

  const normalizedEmail = args.createdByEmail.toLowerCase();
  const normalizedProjectIds = [...new Set(args.projectIds.map((id) => id.trim()).filter(Boolean))];
  const automation = normalizePortfolioAutomation(args.automation ?? { rule_type: "manual" });

  const existing = await getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: normalizedEmail,
    slug,
    ownerEmail: normalizedEmail,
  });
  if (existing.error) {
    return { data: null, error: existing.error };
  }

  let portfolioId = existing.data?.id ?? null;
  if (portfolioId) {
    const { error } = await args.supabase
      .from("project_portfolios")
      .update({ name: args.name.trim(), updated_at: new Date().toISOString(), automation_json: automation })
      .eq("id", portfolioId);
    if (error) {
      return { data: null, error: error.message };
    }

    const { error: deleteError } = await args.supabase
      .from("project_portfolio_projects")
      .delete()
      .eq("portfolio_id", portfolioId);
    if (deleteError) {
      return { data: null, error: deleteError.message };
    }
  } else {
    const inserted = await args.supabase
      .from("project_portfolios")
      .insert({
        created_by_email: normalizedEmail,
        name: args.name.trim(),
        slug,
        automation_json: automation,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      return { data: null, error: inserted.error?.message ?? "Failed to create saved portfolio." };
    }
    portfolioId = inserted.data.id as string;
  }

  const membershipRows = normalizedProjectIds.map((projectId, index) => ({
    portfolio_id: portfolioId,
    project_id: projectId,
    ordinal: index,
    monitor_json: { monitor_keys: [] },
  }));

  const { error: membershipError } = await args.supabase
    .from("project_portfolio_projects")
    .insert(membershipRows);
  if (membershipError) {
    return { data: null, error: membershipError.message };
  }

  return getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: normalizedEmail,
    slug,
    ownerEmail: normalizedEmail,
  });
}

export async function upsertPortfolioProjectMembership(args: {
  supabase: any;
  createdByEmail: string;
  slug: string;
  projectId: string;
  monitorKeys: string[];
  ownerEmail?: string | null;
}) {
  const effectiveOwnerEmail = (args.ownerEmail ?? args.createdByEmail).toLowerCase();
  const existing = await getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: effectiveOwnerEmail,
    slug: args.slug,
    ownerEmail: effectiveOwnerEmail,
  });
  if (existing.error) {
    return { data: null, error: existing.error };
  }
  if (!existing.data) {
    return { data: null, error: "Saved portfolio not found." };
  }

  const normalizedProjectId = args.projectId.trim();
  if (!normalizedProjectId) {
    return { data: null, error: "Project id is required." };
  }

  const existingMembership = (existing.data.projects ?? []).find((item) => item.project_id === normalizedProjectId);
  const ordinal = existingMembership?.ordinal ?? (existing.data.projects?.length ?? 0);
  const monitorKeys = normalizePortfolioMonitorKeys(args.monitorKeys);

  const { error } = await args.supabase
    .from("project_portfolio_projects")
    .upsert({
      portfolio_id: existing.data.id,
      project_id: normalizedProjectId,
      ordinal,
      monitor_json: { monitor_keys: monitorKeys },
    }, { onConflict: "portfolio_id,project_id" });

  if (error) {
    return { data: null, error: error.message };
  }

  await touchPortfolio({ supabase: args.supabase, portfolioId: existing.data.id });
  return getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: effectiveOwnerEmail,
    slug: args.slug,
    ownerEmail: effectiveOwnerEmail,
  });
}

export async function removePortfolioProjectMembership(args: {
  supabase: any;
  createdByEmail: string;
  slug: string;
  projectId: string;
  ownerEmail?: string | null;
}) {
  const effectiveOwnerEmail = (args.ownerEmail ?? args.createdByEmail).toLowerCase();
  const existing = await getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: effectiveOwnerEmail,
    slug: args.slug,
    ownerEmail: effectiveOwnerEmail,
  });
  if (existing.error) {
    return { data: null, error: existing.error };
  }
  if (!existing.data) {
    return { data: null, error: "Saved portfolio not found." };
  }

  const { error } = await args.supabase
    .from("project_portfolio_projects")
    .delete()
    .eq("portfolio_id", existing.data.id)
    .eq("project_id", args.projectId.trim());

  if (error) {
    return { data: null, error: error.message };
  }

  await touchPortfolio({ supabase: args.supabase, portfolioId: existing.data.id });
  return getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: effectiveOwnerEmail,
    slug: args.slug,
    ownerEmail: effectiveOwnerEmail,
  });
}

export async function updateSavedPortfolioAutomation(args: {
  supabase: any;
  createdByEmail: string;
  slug: string;
  ownerEmail?: string | null;
  automation: SavedPortfolioAutomation;
}) {
  const effectiveOwnerEmail = (args.ownerEmail ?? args.createdByEmail).toLowerCase();
  const existing = await getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: effectiveOwnerEmail,
    slug: args.slug,
    ownerEmail: effectiveOwnerEmail,
  });
  if (existing.error) {
    return { data: null, error: existing.error };
  }
  if (!existing.data) {
    return { data: null, error: "Saved portfolio not found." };
  }

  const { error } = await args.supabase
    .from("project_portfolios")
    .update({
      automation_json: normalizePortfolioAutomation(args.automation),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.data.id);
  if (error) {
    return { data: null, error: error.message };
  }

  return getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: effectiveOwnerEmail,
    slug: args.slug,
    ownerEmail: effectiveOwnerEmail,
  });
}

export async function deleteSavedPortfolio(args: {
  supabase: any;
  createdByEmail: string;
  slug: string;
  ownerEmail?: string | null;
}) {
  const existing = await getSavedPortfolioBySlug(args);
  if (existing.error) {
    return { data: null, error: existing.error };
  }
  if (!existing.data) {
    return { data: null, error: "Saved portfolio not found." };
  }

  const { error } = await args.supabase
    .from("project_portfolios")
    .delete()
    .eq("id", existing.data.id);
  if (error) {
    return { data: null, error: error.message };
  }

  return { data: existing.data, error: null };
}

export { normalizePortfolioAutomation, slugifyPortfolioName };
