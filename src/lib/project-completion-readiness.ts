export const COMPLETION_READINESS_ITEMS = [
  { key: "labor_budget", label: "Labor-hours budget entered or marked not applicable" },
  { key: "materials_budget", label: "Materials budget entered or marked not applicable" },
  { key: "labor_sync", label: "QBO Time sync reviewed and current" },
  { key: "employee_rates", label: "Missing or unverified employee rates reviewed" },
  { key: "labor_coding", label: "Unassigned labor coding reviewed" },
  { key: "labor_after_close", label: "Labor after the proposed close date reviewed" },
  { key: "expenses", label: "Expenses and receipts reconciled" },
  { key: "scope_changes", label: "Scope changes and delegated work documented" },
  { key: "production_issues", label: "Production issues logged or no reportable issues attested" },
  { key: "completion_date", label: "Actual completion date confirmed" },
] as const;

export type CompletionReadinessKey = (typeof COMPLETION_READINESS_ITEMS)[number]["key"];
export type CompletionReadinessValue = "pending" | "confirmed" | "exception" | "not_applicable";
export type CompletionReadinessChecklist = Partial<Record<CompletionReadinessKey, CompletionReadinessValue>>;

export function evaluateCompletionReadiness(checklist: CompletionReadinessChecklist) {
  const pending = COMPLETION_READINESS_ITEMS.map((item) => item.key).filter((key) => !checklist[key] || checklist[key] === "pending");
  const exceptions = COMPLETION_READINESS_ITEMS.map((item) => item.key).filter((key) => checklist[key] === "exception");
  return { ready: pending.length === 0, pending, exceptions };
}
