export function canSeeTeamBonuses(role: string | null | undefined): boolean {
  return role === "admin";
}
