export function resolveEffectiveAdminView(actualIsAdmin: boolean, previewNonAdmin: boolean): boolean {
  return actualIsAdmin && !previewNonAdmin;
}
