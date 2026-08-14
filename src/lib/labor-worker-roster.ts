export type LaborWorkerClassification = "employee" | "contractor";

type RosterInput = { employee: string; classification: string; note?: string | null };

const aliases: Record<string, string> = {
  "daniel guiterrez": "daniel gutierrez",
  "cruz eduardo deleon": "eduardo c deleon",
  "eliezar william sosa": "eliezer william salinas sosa",
  "greg maslyk": "gregory maslyk",
  "henry ledezma mireles": "henry ledezma mireles",
  "john chitwood": "john chittwood",
  "jorge reyes": "jorge rodriguez reyes",
  "jose dozal": "jose l dozal",
  "josua datray": "joshua datray",
  "juan gaucin": "juan a gaucin",
  "roger davis": "roger d davis",
};

export function normalizeLaborWorkerName(value: string): string {
  const base = value.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z]/g, " ").replace(/\s+/g, " ").trim();
  return aliases[base] ?? base;
}

export function buildLaborWorkerRosterSnapshot(rows: RosterInput[], rosterSnapshotDate: string) {
  const byName = new Map<string, { display_name: string; classifications: Set<LaborWorkerClassification> }>();
  for (const row of rows) {
    const classification = row.classification === "E" ? "employee" : row.classification === "C" ? "contractor" : null;
    if (!classification || !row.employee?.trim()) continue;
    const normalized_name = normalizeLaborWorkerName(row.employee);
    const current = byName.get(normalized_name) ?? { display_name: row.employee.trim(), classifications: new Set<LaborWorkerClassification>() };
    current.classifications.add(classification);
    byName.set(normalized_name, current);
  }

  return [...byName.entries()].map(([normalized_name, row]) => {
    const rogelio = normalized_name === "rogelio cervantes";
    return {
      normalized_name,
      display_name: row.display_name,
      classification: rogelio ? "employee" : [...row.classifications][0],
      roster_snapshot_date: rosterSnapshotDate,
      source: "maribel_payroll_roster",
      notes: rogelio ? "Visible E roster row is authoritative; hidden C row ignored." : "",
    };
  }).sort((a, b) => a.normalized_name.localeCompare(b.normalized_name));
}
