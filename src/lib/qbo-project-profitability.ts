export function extractQboProjectDetailsId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes('/app/projects/projectdetails')) return null;
    const id = parsed.searchParams.get('id')?.trim() ?? '';
    return id || null;
  } catch {
    return null;
  }
}

export function buildQboProjectDetailsUrl(projectId: string): string {
  return `https://qbo.intuit.com/app/projects/projectdetails?id=${projectId}`;
}
