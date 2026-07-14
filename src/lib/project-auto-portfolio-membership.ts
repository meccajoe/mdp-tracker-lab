import {
  listSavedPortfolios,
  removePortfolioProjectMembership,
  type SavedPortfolioAutomation,
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

type PortfolioOwner = {
  email: string;
  pm_initials: string | null;
  role: string;
  full_name: string | null;
};

const ACTIVE_PROJECT_STATUSES = new Set(["Active", "Pending", "On Hold"]);
const DEFAULT_ALL_ACTIVE_OWNER_EMAILS = new Set(["paul@meccadesign.com"]);

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

async function listPortfolioOwners(supabase: any) {
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

async function ensureManagedPortfolio(args: {
  supabase: any;
  ownerEmail: string;
  portfolioName: string;
  automation: SavedPortfolioAutomation;
  seedProjectId?: string | null;
}) {
  const ownerEmail = args.ownerEmail.toLowerCase();
  const slug = slugifyPortfolioName(args.portfolioName);
  const existingPortfolios = await listSavedPortfolios({
    supabase: args.supabase,
    createdByEmail: ownerEmail,
  });
  if (existingPortfolios.error) {
    return { data: null, error: existingPortfolios.error };
  }

  const existing = (existingPortfolios.data ?? []).find((portfolio) => portfolio.slug === slug);
  if (!existing) {
    if (!args.seedProjectId) {
      return { data: null, error: null };
    }

    return upsertSavedPortfolio({
      supabase: args.supabase,
      createdByEmail: ownerEmail,
      name: args.portfolioName,
      projectIds: [args.seedProjectId],
      automation: args.automation,
    });
  }

  return { data: existing, error: null };
}

async function ensureManagedPortfolioMembership(args: {
  supabase: any;
  ownerEmail: string;
  portfolioName: string;
  projectId: string;
}) {
  return upsertPortfolioProjectMembership({
    supabase: args.supabase,
    createdByEmail: args.ownerEmail,
    ownerEmail: args.ownerEmail,
    slug: slugifyPortfolioName(args.portfolioName),
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
  const removed = await removePortfolioProjectMembership({
    supabase: args.supabase,
    createdByEmail: args.ownerEmail,
    ownerEmail: args.ownerEmail,
    slug: slugifyPortfolioName(args.portfolioName),
    projectId: args.projectId,
  });
  if (removed.error && removed.error !== "Saved portfolio not found.") {
    return { data: null, error: removed.error };
  }

  return { data: removed.data, error: null };
}

async function seedDefaultManagedPortfolios(args: {
  supabase: any;
  projectId: string;
  pmInitials: string | null;
  shouldBeActive: boolean;
  owners: PortfolioOwner[];
}) {
  if (!args.shouldBeActive) {
    return { data: null, error: null };
  }

  const pmOwner = args.pmInitials
    ? args.owners.find((row) => row.pm_initials === args.pmInitials) ?? null
    : null;

  if (args.pmInitials && !pmOwner) {
    return { data: null, error: `No portfolio owner found for PM initials ${args.pmInitials}.` };
  }

  if (pmOwner?.pm_initials) {
    const ensuredPmPortfolio = await ensureManagedPortfolio({
      supabase: args.supabase,
      ownerEmail: pmOwner.email,
      portfolioName: buildPmStartingPortfolioName(pmOwner.pm_initials),
      automation: { rule_type: "pm_active_projects", pm_initials: pmOwner.pm_initials },
      seedProjectId: args.projectId,
    });
    if (ensuredPmPortfolio.error) {
      return { data: null, error: ensuredPmPortfolio.error };
    }
  }

  for (const owner of args.owners.filter((row) => DEFAULT_ALL_ACTIVE_OWNER_EMAILS.has(row.email))) {
    const ensuredGlobalPortfolio = await ensureManagedPortfolio({
      supabase: args.supabase,
      ownerEmail: owner.email,
      portfolioName: buildGlobalStartingPortfolioName(),
      automation: { rule_type: "all_active_projects", pm_initials: null },
      seedProjectId: args.projectId,
    });
    if (ensuredGlobalPortfolio.error) {
      return { data: null, error: ensuredGlobalPortfolio.error };
    }
  }

  return { data: null, error: null };
}

function portfolioMatchesProject(args: {
  automation: SavedPortfolioAutomation;
  projectPmInitials: string | null;
  shouldBeActive: boolean;
}) {
  if (!args.shouldBeActive) {
    return false;
  }

  if (args.automation.rule_type === "all_active_projects") {
    return true;
  }

  if (args.automation.rule_type === "pm_active_projects") {
    return !!args.projectPmInitials && args.projectPmInitials === normalizePmInitials(args.automation.pm_initials);
  }

  return false;
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

  const owners = await listPortfolioOwners(args.supabase);
  if (owners.error) {
    return { data: null, error: owners.error };
  }

  const normalizedPm = normalizePmInitials(args.pmInitials);
  const status = args.status?.trim() ?? null;
  const shouldBeActive = !!normalizedPm && !!status && ACTIVE_PROJECT_STATUSES.has(status);

  const seeded = await seedDefaultManagedPortfolios({
    supabase: args.supabase,
    projectId,
    pmInitials: normalizedPm,
    shouldBeActive,
    owners: owners.data ?? [],
  });
  if (seeded.error) {
    return { data: null, error: seeded.error };
  }

  const portfolios = await listSavedPortfolios({ supabase: args.supabase });
  if (portfolios.error) {
    return { data: null, error: portfolios.error };
  }

  const matchedPortfolioNames: string[] = [];
  const matchedOwnerEmails: string[] = [];

  for (const portfolio of portfolios.data ?? []) {
    if (portfolio.automation.rule_type === "manual") {
      continue;
    }

    const matches = portfolioMatchesProject({
      automation: portfolio.automation,
      projectPmInitials: normalizedPm,
      shouldBeActive,
    });

    if (matches) {
      const ensured = await ensureManagedPortfolioMembership({
        supabase: args.supabase,
        ownerEmail: portfolio.created_by_email,
        portfolioName: portfolio.name,
        projectId,
      });
      if (ensured.error) {
        return { data: null, error: ensured.error };
      }
      matchedPortfolioNames.push(portfolio.name);
      matchedOwnerEmails.push(portfolio.created_by_email);
      continue;
    }

    const removed = await removeManagedPortfolioMembership({
      supabase: args.supabase,
      ownerEmail: portfolio.created_by_email,
      portfolioName: portfolio.name,
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
      portfolioName: matchedPortfolioNames[0] ?? null,
      ownerEmail: matchedOwnerEmails[0] ?? null,
      portfolioNames: matchedPortfolioNames,
      ownerEmails: matchedOwnerEmails,
    },
    error: null,
  };
}
