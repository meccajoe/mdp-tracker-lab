export function canManageProjectActions(role: string | null | undefined): boolean {
  return role === "admin";
}
