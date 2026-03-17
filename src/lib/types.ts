export interface Project {
  id: string;
  name: string;
  client: string;
  pm: string;
  close_date: string | null;
  contract_amount: number | null;
  status: "Active" | "Completed" | "On Hold";
  notes: string | null;
  budget_hrs: number | null;
  budget_design: number | null;
  budget_pm: number | null;
  budget_shipping: number | null;
  budget_id_labor: number | null;
  budget_travel: number | null;
  budget_props: number | null;
  budget_equipment: number | null;
  budget_flooring: number | null;
  project_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary extends Project {
  total_hrs_used: number;
  total_spent: number;
  pending_amount: number;
  budget_labor_dollars: number;
  pct_hrs_used: number;
  total_budget: number;
  pct_budget_used: number;
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

export interface CogsCategory {
  code: string;
  name: string;
  definition: string | null;
}

export const PM_OPTIONS = ["VW", "GM", "MS", "AS", "NG", "PM"] as const;

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
