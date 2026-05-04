export interface Project {
  id: string;
  name: string;
  client: string;
  pm: string;
  job_number: string | null;
  close_date: string | null;
  due_date: string | null;
  contract_amount: number | null;
  status: "Active" | "Completed" | "On Hold" | "Pending";
  notes: string | null;
  hubspot_deal_id: string | null;
  hubspot_deal_url: string | null;
  qbo_project_id: string | null;
  qbo_project_url: string | null;
  budget_hrs: number | null;
  budget_design: number | null;
  budget_pm: number | null;
  budget_shipping: number | null;
  budget_id_labor: number | null;
  budget_travel: number | null;
  budget_props: number | null;
  budget_equipment: number | null;
  budget_rental: number | null;
  budget_flooring: number | null;
  project_type: string | null;
  created_at: string;
  updated_at: string;
  // Quote amounts (admin-only, entered by Emily from the proposal)
  budget_materials: number | null;
  // Quote amounts (admin-only, not shown to PMs)
  quote_labor: number | null;
  quote_materials: number | null;
  // Per-project L&M pct overrides
  pct_labor: number | null;
  pct_materials: number | null;
  quote_design: number | null;
  quote_pm: number | null;
  quote_shipping: number | null;
  quote_id_labor: number | null;
  quote_travel: number | null;
  quote_props: number | null;
  quote_equipment: number | null;
  quote_flooring: number | null;
  // Per-project % overrides (null = use global default)
  pct_design: number | null;
  pct_pm: number | null;
  pct_shipping: number | null;
  pct_id_labor: number | null;
  pct_travel: number | null;
  pct_props: number | null;
  pct_equipment: number | null;
  pct_flooring: number | null;
}

export interface ProjectSummary extends Project {
  total_hrs_used: number;
  total_spent: number;
  pending_amount: number;
  budget_labor_dollars: number;
  pct_hrs_used: number;
  total_budget: number;
  pct_budget_used: number;
  qbo_total_hours: number;
  qbo_labor_cost: number;
  qbo_last_synced: string | null;
}

export interface Expense {
  id: string;
  project_id: string;
  date: string;
  category: string;
  cogs_code: string | null;
  vendor: string | null;
  amount: number;
  amount_pending: boolean;
  purchaser: string | null;
  notes: string | null;
  created_at: string;
  flagged?: boolean;
  flag_note?: string | null;
  flagged_by?: string | null;
  flagged_at?: string | null;
  source?: string | null;
  external_id?: string | null;
  synced_at?: string | null;
}

export interface LaborEntry {
  id: string;
  project_id: string;
  date: string;
  person: string;
  hours: number;
  labor_type: string | null;
  notes: string | null;
  created_at: string;
}

export interface QboLaborEntry {
  id: string;
  project_id: string;
  employee_name: string;
  date: string;
  reg_hours: number;
  ot_hours: number;
  hourly_rate: number;
  qbo_entry_id: string;
  synced_at: string;
}

export interface CogsCategory {
  code: string;
  name: string;
  definition: string | null;
}

export const PM_OPTIONS = ["VW", "GM", "MS", "AS", "NG", "PM", "KM", "KS", "CC", "MM"] as const;

// Full PM name lookup — fallback for hardcoded initials; prefer DB-driven lookup where possible
export const PM_NAMES: Record<string, string> = {
  VW: "Vanessa Warfield",
  GM: "Greg Mayberry",
  MS: "Molly Strader",
  AS: "Aaron Schindehette",
  NG: "Nick Gonzales",
  PM: "Paul Mecca",
  KM: "Kristina Morland",
  KS: "Kristin Schilling",
  CC: "Carlos Chaidez",
  MM: "Maria Mecca",
};

export function getPMName(initials: string, dbUsers?: { pm_initials: string | null; full_name: string | null }[]): string {
  if (dbUsers) {
    const match = dbUsers.find((u) => u.pm_initials === initials);
    if (match?.full_name) return match.full_name;
  }
  return PM_NAMES[initials] ?? initials;
}

// User roles — extended with full_name
export interface UserRoleRow {
  email: string;
  role: string;
  pm_initials: string | null;
  full_name: string | null;
  show_in_filters: boolean;
}

export const PROJECT_STATUSES = ["Active", "Completed", "On Hold"] as const;

export const PROJECT_TYPES = [
  "Trade Show",
  "Event Activation",
  "Retail Install",
  "Corporate Event",
  "Museum/Exhibition",
  "Pop-Up",
  "Other",
] as const;

export const LABOR_TYPES = [
  "Production Labor",
  "I&D Labor",
  "Design Labor",
] as const;
