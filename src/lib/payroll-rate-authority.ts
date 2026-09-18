import { normalizeLaborWorkerName } from "./labor-worker-roster";

export type PayrollRateInputRow = {
  employee: string;
  classification: string | null;
  standardRate: number | null;
  note: string;
  sourceRowNumber: number;
};

export type PayrollRateSource = {
  sourceLabel: string;
  sourceModifiedAt: string;
  baselineDate: string;
};

export type PayrollRateAuthorityRecord = {
  normalizedName: string;
  displayName: string;
  classification: "employee" | "contractor";
  baseHourlyRate: number;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  sourceLabel: string;
  sourceModifiedAt: string;
  sourceNote: string;
  sourceRowNumber: number;
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function toIsoDate(month: number, day: number, year: number): string {
  const fullYear = year < 100 ? 2000 + year : year;
  const candidate = new Date(Date.UTC(fullYear, month - 1, day));
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(fullYear)
    || candidate.getUTCFullYear() !== fullYear || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date: ${month}/${day}/${fullYear}`);
  }
  return `${fullYear.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseDateToken(value: string): string | null {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  return match ? toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

export function parsePayrollDate(value: string): string {
  const parsed = parseDateToken(value);
  if (!parsed) throw new Error(`Invalid payroll date: ${value}`);
  return parsed;
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function laterDate(first: string, second?: string): string {
  return second && second > first ? second : first;
}

function documentedStart(note: string, source: PayrollRateSource, observedStart?: string): string | null {
  const explicitHire = note.match(/(?:re-?hired|hired back|hired?|hire|start date)[^0-9]{0,24}(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (explicitHire) {
    const date = parseDateToken(explicitHire[1]);
    return date ? laterDate(source.baselineDate, date) : source.baselineDate;
  }

  if (/mid[- ]december\s+2025/i.test(note)) return "2025-12-15";

  const monthYear = note.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?|september|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/i);
  if (monthYear) {
    const monthStart = toIsoDate(MONTHS[monthYear[1].toLowerCase()], 1, Number(monthYear[2]));
    return laterDate(monthStart, observedStart);
  }

  const yearlessRehire = note.match(/(?:re-?hired|hired back)[^0-9]{0,24}(\d{1,2})\/(\d{1,2})(?!\/)/i);
  if (yearlessRehire) {
    const modifiedDate = new Date(source.sourceModifiedAt).toISOString().slice(0, 10);
    let year = Number(modifiedDate.slice(0, 4));
    let candidate = toIsoDate(Number(yearlessRehire[1]), Number(yearlessRehire[2]), year);
    if (candidate > modifiedDate) {
      year -= 1;
      candidate = toIsoDate(Number(yearlessRehire[1]), Number(yearlessRehire[2]), year);
    }
    return laterDate(source.baselineDate, candidate);
  }

  return null;
}

function isTerminatedOnly(note: string): boolean {
  return /terminated|no longer active/i.test(note) && !/(rehired|re-hired|hired back|comes back)/i.test(note);
}

export function buildPayrollRateAuthorityRecords(
  rows: PayrollRateInputRow[],
  source: PayrollRateSource,
  observedWorkDates: ReadonlyMap<string, string>,
): PayrollRateAuthorityRecord[] {
  const grouped = new Map<string, PayrollRateInputRow[]>();
  for (const row of rows) {
    const normalizedName = normalizeLaborWorkerName(row.employee ?? "");
    if (!normalizedName || !Number.isFinite(row.standardRate) || Number(row.standardRate) <= 0) continue;
    grouped.set(normalizedName, [...(grouped.get(normalizedName) ?? []), row]);
  }

  const records: PayrollRateAuthorityRecord[] = [];
  for (const [normalizedName, candidates] of grouped) {
    const row = candidates.filter((candidate) => !isTerminatedOnly(candidate.note ?? "")).at(-1);
    if (!row) continue;

    const note = row.note?.trim() ?? "";
    const classification = row.classification === "E" ? "employee" : row.classification === "C" ? "contractor" : null;
    if (!classification) continue;

    const observedStart = observedWorkDates.get(normalizedName);
    const documented = documentedStart(note, source, observedStart);
    const explicitEffective = note.match(/effective\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    const changeDate = explicitEffective ? parseDateToken(explicitEffective[1]) : null;
    const currentStart = changeDate ?? documented ?? observedStart ?? source.baselineDate;
    const base: Omit<PayrollRateAuthorityRecord, "baseHourlyRate" | "effectiveStartDate" | "effectiveEndDate"> = {
      normalizedName,
      displayName: row.employee.trim(),
      classification,
      sourceLabel: source.sourceLabel,
      sourceModifiedAt: source.sourceModifiedAt,
      sourceNote: note,
      sourceRowNumber: row.sourceRowNumber,
    };

    const increase = note.match(/increase from\s+\$([0-9]+(?:\.[0-9]+)?)\s+effective\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (increase) {
      const increaseDate = parseDateToken(increase[2]);
      const priorStart = laterDate(source.baselineDate, observedStart);
      if (increaseDate && priorStart <= previousDate(increaseDate)) {
        records.push({ ...base, baseHourlyRate: Number(increase[1]), effectiveStartDate: priorStart, effectiveEndDate: previousDate(increaseDate) });
      }
    }

    records.push({ ...base, baseHourlyRate: Number(row.standardRate), effectiveStartDate: currentStart, effectiveEndDate: null });
  }

  return records.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName) || a.effectiveStartDate.localeCompare(b.effectiveStartDate));
}

export type PayrollRateRowOutcome = {
  sourceRowNumber: number;
  employee: string;
  normalizedName: string;
  outcome: "imported" | "invalid_rate" | "terminated" | "duplicate_superseded" | "invalid_classification" | "skipped";
};

export function classifyPayrollRateRows(
  rows: PayrollRateInputRow[],
  records: PayrollRateAuthorityRecord[],
): PayrollRateRowOutcome[] {
  const importedRows = new Set(records.map((record) => record.sourceRowNumber));
  const importedNames = new Set(records.map((record) => record.normalizedName));
  return rows.map((row) => {
    const normalizedName = normalizeLaborWorkerName(row.employee);
    let outcome: PayrollRateRowOutcome["outcome"] = "skipped";
    if (importedRows.has(row.sourceRowNumber)) outcome = "imported";
    else if (!Number.isFinite(row.standardRate) || Number(row.standardRate) <= 0) outcome = "invalid_rate";
    else if (isTerminatedOnly(row.note ?? "")) outcome = "terminated";
    else if (!['E', 'C'].includes(row.classification ?? "")) outcome = "invalid_classification";
    else if (importedNames.has(normalizedName)) outcome = "duplicate_superseded";
    return { sourceRowNumber: row.sourceRowNumber, employee: row.employee, normalizedName, outcome };
  });
}
