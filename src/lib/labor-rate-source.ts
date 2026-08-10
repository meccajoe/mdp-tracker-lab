export interface LaborRateEntry {
  qbo_entry_id: string;
  hourly_rate: number | null | undefined;
}

/**
 * QBO TimeActivity records currently expose $0 hourly rates. TSheets is the
 * current approved time/pay-rate source for cost-bearing labor entries.
 */
export function isCanonicalLaborCostEntry(entry: LaborRateEntry): boolean {
  return entry.qbo_entry_id.startsWith("ts_") && Number(entry.hourly_rate) > 0;
}

export function canonicalLaborCostQueryFilter() {
  return {
    column: "qbo_entry_id" as const,
    operator: "like" as const,
    value: "ts_%",
  };
}
