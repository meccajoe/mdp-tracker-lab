const ISSUE_MANAGER_ROLES = new Set(["admin", "pm", "production"]);

export function canManageIssues(role: string | null | undefined): boolean {
  return typeof role === "string" && ISSUE_MANAGER_ROLES.has(role);
}
