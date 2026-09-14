export async function ensureBillBudgetForProject(projectId: string) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/bill-budget`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const result = await response.json().catch(() => ({})) as { error?: string; details?: { error?: string } };
  if (!response.ok) {
    throw new Error(result.error ?? result.details?.error ?? "BILL budget creation failed");
  }
  return result;
}
