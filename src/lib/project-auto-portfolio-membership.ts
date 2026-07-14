import {
  getSavedPortfolioBySlug,
  removePortfolioProjectMembership,
  slugifyPortfolioName,
  upsertPortfolioProjectMembership,
  upsertSavedPortfolio,
} from "./project-saved-portfolios.ts";

type PmUserRow = {
  email: string;
  pm_initials: string | null;
  role: string;
  full_name?: string | null;
};

const ACTIVE_PROJECT_STATUSES = new Set(["Active", "Pending", "On Hold"]);
const MANAGED_PM_ROLES = new Set(["pm", "admin"]);
const GLOBAL_ACTIVE_PORTFOLIO_OWNER_EMAILS = new Set(["paul@meccadesign.com"]);

type PortfolioOwner = {
  email: string;
  pm_initials: string | null;
  role: string;
  full_name: string | null;
};

export function buildPmStartingPortfolioName(pmInitials: string) {
  return `${pmInitials.trim().toUpperCase()} Active Projects`;
}

export function buildGlobalStartingPortfolioName() {
  return "All Active Projects";
}

function normalizePmInitials(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

async function listPmPortfolioOwners(supabase: any) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("email, pm_initials, role, full_name")
    .order("email", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = ((data ?? []) as PmUserRow[])
    .filter((row) => !!row.email)
    .map((row) => ({
      email: row.email.toLowerCase(),
      pm_initials: normalizePmInitials(row.pm_initials),
      role: row.role,
      full_name: typeof row.full_name === "string" ? row.full_name : null,
    }))
    .filter((row): row is PortfolioOwner => !!row.email);

  return { data: rows, error: null };
}

async function ensureManagedPortfolioMembership(args: {
  supabase: any;
  ownerEmail: string;
  portfolioName: string;
  projectId: string;
}) {
  const slug = slugifyPortfolioName(args.portfolioName);
  const existing = await getSavedPortfolioBySlug({
    supabase: args.supabase,
    createdByEmail: args.ownerEmail,
    slug,
  });
  if (existing.error) {
    return { data: null, error: existing.error };
  }

  if (!existing.data) {
    return upsertSavedPortfolio({
      supabase: args.supabase,
      createdByEmail: args.ownerEmail,
      name: args.portfolioName,
      projectIds: [args.projectId],
    });
  }

  return upsertPortfolioProjectMembership({
    supabase: args.supabase,
    createdByEmail: args.ownerEmail,
    slug,
    projectId: args.projectId,
    monitorKeys: [],
  });
}

async function removeManagedPortfolioMembership(args: {
  supabase: any;
  ownerEmail: string;
  portfolioName: string;
  projectId: string;
}) {
  const slug = slugifyPortfolioName(args.portfolioName);
  const removed = await removePortfolioProjectMembership({
    supabase: args.supabase,
    createdByEmail: args.ownerEmail,
    slug,
    projectId: args.projectId,
  });
  if (removed.error && removed.error !== "Saved portfolio not found.") {
    return { data: null, error: removed.error };
  }

  return { data: removed.data, error: null };
}

export async function syncPmStartingPortfolioMembership(args: {
  supabase: any;
  projectId: string;
  pmInitials?: string | null;
  status?: string | null;
}) {
  const projectId = args.projectId.trim();
  if (!projectId) {
    return { data: null, error: "Project id is required." };
  }

  const owners = await listPmPortfolioOwners(args.supabase);
  if (owners.error) {
    return { data: null, error: owners.error };
  }

  const normalizedPm = normalizePmInitials(args.pmInitials);
  const status = args.status?.trim() ?? null;
  const shouldBeActive = !!normalizedPm && !!status && ACTIVE_PROJECT_STATUSES.has(status);
  const pmOwners = (owners.data ?? []).filter((row) => row.pm_initials && MANAGED_PM_ROLES.has(String(row.role ?? "").toLowerCase()));
  const globalOwners = (owners.data ?? []).filter((row) => GLOBAL_ACTIVE_PORTFOLIO_OWNER_EMAILS.has(row.email));
  const desiredPmOwner = shouldBeActive
    ? pmOwners.find((row) => row.pm_initials === normalizedPm) ?? null
    : null;

  if (shouldBeActive && !desiredPmOwner) {
    return { data: null, error: `No portfolio owner found for PM initials ${normalizedPm}.` };
  }

  const desiredMemberships = new Map<string, { ownerEmail: string; portfolioName: string }>();
  if (desiredPmOwner) {
    const portfolioName = buildPmStartingPortfolioName(desiredPmOwner.pm_initials!);
    desiredMemberships.set(`${desiredPmOwner.email}:${slugifyPortfolioName(portfolioName)}`, {
      ownerEmail: desiredPmOwner.email,
      portfolioName,
    });
  }
  if (shouldBeActive) {
    for (const owner of globalOwners) {
      const portfolioName = buildGlobalStartingPortfolioName();
      desiredMemberships.set(`${owner.email}:${slugifyPortfolioName(portfolioName)}`, {
        ownerEmail: owner.email,
        portfolioName,
      });
    }
  }

  for (const owner of pmOwners) {
    const portfolioName = buildPmStartingPortfolioName(owner.pm_initials!);
    const key = `${owner.email}:${slugifyPortfolioName(portfolioName)}`;
    if (desiredMemberships.has(key)) {
      const ensured = await ensureManagedPortfolioMembership({
        supabase: args.supabase,
        ownerEmail: owner.email,
        portfolioName,
        projectId,
      });
      if (ensured.error) {
        return { data: null, error: ensured.error };
      }
      continue;
    }

    const removed = await removeManagedPortfolioMembership({
      supabase: args.supabase,
      ownerEmail: owner.email,
      portfolioName,
      projectId,
    });
    if (removed.error) {
      return { data: null, error: removed.error };
    }
  }

  for (const owner of globalOwners) {
    const portfolioName = buildGlobalStartingPortfolioName();
    const key = `${owner.email}:${slugifyPortfolioName(portfolioName)}`;
    if (desiredMemberships.has(key)) {
      const ensured = await ensureManagedPortfolioMembership({
        supabase: args.supabase,
        ownerEmail: owner.email,
        portfolioName,
        projectId,
      });
      if (ensured.error) {
        return { data: null, error: ensured.error };
      }
      continue;
    }

    const removed = await removeManagedPortfolioMembership({
      supabase: args.supabase,
      ownerEmail: owner.email,
      portfolioName,
      projectId,
    });
    if (removed.error) {
      return { data: null, error: removed.error };
    }
  }

  return {
    data: {
      projectId,
      pmInitials: normalizedPm,
      status,
      portfolioName: desiredPmOwner ? buildPmStartingPortfolioName(desiredPmOwner.pm_initials!) : null,
      ownerEmail: desiredPmOwner?.email ?? null,
      portfolioNames: Array.from(desiredMemberships.values()).map((entry) => entry.portfolioName),
    },
    error: null,
  };
}
