export type LaborBucket = "Production Labor" | "I&D Labor" | "Contractor Labor";

export interface LaborAllocationPreviewEntry {
  projectId: string;
  projectName: string;
  serviceItem: string | null;
  hours: number;
  hourlyRate: number;
}

export interface LaborAllocationMapping {
  serviceItem: string;
  laborBucket: LaborBucket;
  sourceGlAccountId: string;
  targetGlAccountId: string;
}

export interface LaborAllocationPreviewRow {
  projectId: string;
  projectName: string;
  serviceItem: string;
  laborBucket: LaborBucket | null;
  sourceGlAccountId: string | null;
  targetGlAccountId: string | null;
  hours: number;
  wageCost: number;
  status: "mapped" | "unmapped";
}

export function buildLaborAllocationPreview({
  entries,
  mappings,
}: {
  entries: LaborAllocationPreviewEntry[];
  mappings: LaborAllocationMapping[];
}) {
  const mappingByServiceItem = new Map(mappings.map((mapping) => [mapping.serviceItem, mapping]));
  const grouped = new Map<string, LaborAllocationPreviewRow>();

  for (const entry of entries) {
    if (entry.hours <= 0 || entry.hourlyRate <= 0) continue;

    const serviceItem = entry.serviceItem?.trim() || "Unclassified service item";
    const mapping = mappingByServiceItem.get(serviceItem);
    const key = `${entry.projectId}\u0000${serviceItem}`;
    const existing = grouped.get(key);
    const wageCost = entry.hours * entry.hourlyRate;

    if (existing) {
      existing.hours += entry.hours;
      existing.wageCost += wageCost;
      continue;
    }

    grouped.set(key, {
      projectId: entry.projectId,
      projectName: entry.projectName,
      serviceItem,
      laborBucket: mapping?.laborBucket ?? null,
      sourceGlAccountId: mapping?.sourceGlAccountId ?? null,
      targetGlAccountId: mapping?.targetGlAccountId ?? null,
      hours: entry.hours,
      wageCost,
      status: mapping ? "mapped" : "unmapped",
    });
  }

  const rows = [...grouped.values()]
    .map((row) => ({ ...row, hours: round(row.hours), wageCost: round(row.wageCost) }))
    .sort((a, b) => a.projectId.localeCompare(b.projectId) || a.serviceItem.localeCompare(b.serviceItem));
  const totals = rows.reduce(
    (summary, row) => ({
      hours: summary.hours + row.hours,
      wageCost: summary.wageCost + row.wageCost,
      mappedWageCost: summary.mappedWageCost + (row.status === "mapped" ? row.wageCost : 0),
      unmappedWageCost: summary.unmappedWageCost + (row.status === "unmapped" ? row.wageCost : 0),
    }),
    { hours: 0, wageCost: 0, mappedWageCost: 0, unmappedWageCost: 0 }
  );

  return {
    rows,
    totals: {
      hours: round(totals.hours),
      wageCost: round(totals.wageCost),
      mappedWageCost: round(totals.mappedWageCost),
      unmappedWageCost: round(totals.unmappedWageCost),
    },
  };
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
