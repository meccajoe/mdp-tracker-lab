function slugifyPortfolioName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export type SavedPortfolioRow = {
  id: string;
  created_by_email: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  project_ids?: string[];
};

export async function listSavedPortfolios(args: {
  supabase: any;
  createdByEmail: string;
}) {
  const { data, error } = await args.supabase
    .from("project_portfolios")
    .select("id, created_by_email, name, slug, created_at, updated_at, project_portfolio_projects(project_id, ordinal)")
    .eq("created_by_email", args.createdByEmail.toLowerCase())
    .order("updated_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    created_by_email: String(row.created_by_email),
    name: String(row.name),
    slug: String(row.slug),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    project_ids: ((row.project_portfolio_projects as Array<Record<string, unknown>> | null | undefined) ?? [])
      .sort((a, b) => Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0))
      .map((item) => String(item.project_id)),
  } satisfies SavedPortfolioRow));

  return { data: rows, error: null };
}

export async function getSavedPortfolioBySlug(args: {
  supabase: any;
  createdByEmail: string;
  slug: string;
}) {
  const portfolios = await listSavedPortfolios(args);
  if (portfolios.error) {
    return { data: null, error: portfolios.error };
  }

  const row = (portfolios.data ?? []).find((portfolio) => portfolio.slug === args.slug.toLowerCase());
  return { data: row ?? null, error: null };
}

export async function upsertSavedPortfolio(args: {
  supabase: any;
  createdByEmail: string;
  name: string;
  projectIds: string[];
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

  const existing = await getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: normalizedEmail,
    slug,
  });
  if (existing.error) {
    return { data: null, error: existing.error };
  }

  let portfolioId = existing.data?.id ?? null;
  if (portfolioId) {
    const { error } = await args.supabase
      .from("project_portfolios")
      .update({ name: args.name.trim(), updated_at: new Date().toISOString() })
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
  });
}

export async function deleteSavedPortfolio(args: {
  supabase: any;
  createdByEmail: string;
  slug: string;
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

export { slugifyPortfolioName };
