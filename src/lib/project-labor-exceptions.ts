export type LaborExceptionEntry = {
  date: string;
  reg_hours: number;
  ot_hours: number;
  hourly_rate: number | null;
  rate_source?: string | null;
  service_item?: string | null;
};

export type LaborExceptionRow = {
  key: "unverified_rate" | "unassigned_coding" | "after_close";
  label: string;
  entries: number;
  hours: number;
  action: string;
};

function summarize(key: LaborExceptionRow["key"], label: string, action: string, entries: LaborExceptionEntry[]): LaborExceptionRow | null {
  if (!entries.length) return null;
  return {
    key,
    label,
    entries: entries.length,
    hours: Math.round(entries.reduce((sum, entry) => sum + Number(entry.reg_hours ?? 0) + Number(entry.ot_hours ?? 0), 0) * 100) / 100,
    action,
  };
}

export function buildLaborExceptionRows(entries: LaborExceptionEntry[], closeDate?: string | null): LaborExceptionRow[] {
  const rows = [
    summarize("unverified_rate", "Missing or unverified rate", "Resolve employee pay-rate provenance in QBO Time", entries.filter((entry) => !(Number(entry.hourly_rate) > 0 && entry.rate_source?.startsWith("qbo_time_users")))),
    summarize("unassigned_coding", "Unassigned labor coding", "Assign a service item / trade in QBO Time", entries.filter((entry) => !entry.service_item || entry.service_item.trim().toLowerCase() === "unassigned")),
    summarize("after_close", "Labor dated after close", "Confirm late entry, continued work, or correct the close date", closeDate ? entries.filter((entry) => entry.date > closeDate) : []),
  ];
  return rows.filter((row): row is LaborExceptionRow => row !== null);
}
