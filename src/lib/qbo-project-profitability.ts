export interface QboProjectProfitabilityRow {
  jobNumber: string;
  projectName: string;
  customerName: string | null;
  income: number;
  costs: number;
  profit: number;
  profitMargin: string | null;
}

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

function parseMoney(value: string | null | undefined): number {
  const normalized = (value ?? '').replace(/[$,%\s,]/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseProjectProfitabilitySummaryRow(row: {
  ColData?: Array<{ value?: string | null }>;
}): QboProjectProfitabilityRow | null {
  const cols = row.ColData ?? [];
  const projectName = cols[0]?.value?.trim() ?? '';
  const jobMatch = projectName.match(/^(\d{4,6})\b/);
  if (!projectName || !jobMatch) return null;

  return {
    jobNumber: jobMatch[1],
    projectName,
    customerName: cols[1]?.value?.trim() || null,
    income: parseMoney(cols[2]?.value),
    costs: parseMoney(cols[3]?.value),
    profit: parseMoney(cols[4]?.value),
    profitMargin: cols[5]?.value?.trim() || null,
  };
}
