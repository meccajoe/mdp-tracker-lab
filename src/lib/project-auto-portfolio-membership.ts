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
};

const ACTIVE_PROJECT_STATUSES = new Set(["Active", "Pending", "On Hold"]);
const MANAGED_PM_ROLES = new Set(["pm", "admin"]);

export function buildPmStartingPortfolioName(pmInitials: string) {
  return `${pmInitials.trim().toUpperCase()} Active Projects`;
}

function normalizePmInitials(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

async function listPmPortfolioOwners(supabase: any) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("email, pm_initials, role")
    .not("pm_initials", "is", null)
    .order("pm_initials", { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = ((data ?? []) as PmUserRow[])
    .filter((row) => !!row.email && !!row.pm_initials && MANAGED_PM_ROLES.has(String(row.role ?? "").toLowerCase()))
    .map((row) => ({
      email: row.email.toLowerCase(),
      pm_initials: normalizePmInitials(row.pm_initials),
      role: row.role,
    }))
    .filter((row): row is { email: string; pm_initials: string; role: string } => !!row.pm_initials);

  return { data: rows, error: null };
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
  const desiredOwner = shouldBeActive
    ? owners.data?.find((row) => row.pm_initials === normalizedPm) ?? null
    : null;

  if (shouldBeActive && !desiredOwner) {
    return { data: null, error: `No portfolio owner found for PM initials ${normalizedPm}.` };
  }

  for (const owner of owners.data ?? []) {
    const portfolioName = buildPmStartingPortfolioName(owner.pm_initials);
    const slug = slugifyPortfolioName(portfolioName);

    if (desiredOwner && owner.pm_initials === desiredOwner.pm_initials) {
      const existing = await getSavedPortfolioBySlug({
        supabase: args.supabase,
        createdByEmail: owner.email,
        slug,
      });
      if (existing.error) {
        return { data: null, error: existing.error };
      }

      if (!existing.data) {
        const created = await upsertSavedPortfolio({
          supabase: args.supabase,
          createdByEmail: owner.email,
          name: portfolioName,
          projectIds: [projectId],
        });
        if (created.error) {
          return { data: null, error: created.error };
        }
      } else {
        const upserted = await upsertPortfolioProjectMembership({
          supabase: args.supabase,
          createdByEmail: owner.email,
          slug,
          projectId,
          monitorKeys: [],
        });
        if (upserted.error) {
          return { data: null, error: upserted.error };
        }
      }

      continue;
    }

    const removed = await removePortfolioProjectMembership({
      supabase: args.supabase,
      createdByEmail: owner.email,
      slug,
      projectId,
    });
    if (removed.error && removed.error !== "Saved portfolio not found.") {
      return { data: null, error: removed.error };
    }
  }

  return {
    data: {
      projectId,
      pmInitials: normalizedPm,
      status,
      portfolioName: desiredOwner ? buildPmStartingPortfolioName(desiredOwner.pm_initials) : null,
      ownerEmail: desiredOwner?.email ?? null,
    },
    error: null,
  };
}
