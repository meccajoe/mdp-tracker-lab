export interface LaborRateEntry {
  qbo_entry_id: string;
  hourly_rate: number | null | undefined;
  rate_source?: string | null;
}

export type LaborRateSnapshot = {
  hourly_rate: number | null;
  rate_source: string | null;
  rate_verified_at: string | null;
};

const VERIFIED_RATE_SOURCES = new Set(["qbo_time_users", "qbo_time_users_matched"]);

function hasVerifiedRate(entry: Pick<LaborRateEntry, "hourly_rate" | "rate_source">): boolean {
  return Number(entry.hourly_rate) > 0 && VERIFIED_RATE_SOURCES.has(entry.rate_source ?? "");
}

/**
 * QBO TimeActivity records currently expose $0 hourly rates. TSheets is the
 * current approved time/pay-rate source for cost-bearing labor entries.
 */
export function isCanonicalLaborCostEntry(entry: LaborRateEntry): boolean {
  return entry.qbo_entry_id.startsWith("ts_") && hasVerifiedRate(entry);
}

export function resolveLaborRateForSync(
  existing: LaborRateSnapshot | undefined,
  incoming: LaborRateSnapshot,
): LaborRateSnapshot {
  if (existing && hasVerifiedRate(existing)) return existing;
  if (hasVerifiedRate(incoming)) return incoming;
  return { hourly_rate: null, rate_source: null, rate_verified_at: null };
}

export function canonicalLaborCostQueryFilter() {
  return {
    column: "qbo_entry_id" as const,
    operator: "like" as const,
    value: "ts_%",
  };
}
