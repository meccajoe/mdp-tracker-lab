export type PostMortemLaborEntry = { employee_name: string; service_item: string | null; reg_hours: number; ot_hours: number; hourly_rate: number | null; qbo_entry_id: string; rate_source: string | null; rate_verified_at: string | null };

const roundHours = (value: number) => Math.round(value * 100) / 100;
const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function buildPostMortemLaborEvidence(entries: PostMortemLaborEntry[]) {
  const canonical = entries.filter((entry) => entry.qbo_entry_id.startsWith("ts_"));
  const byServiceItem = new Map<string, { hours: number; calculated_cost: number; entry_ids: string[] }>();
  const byEmployeeRate = new Map<string, { employee_name: string; regular_hours: number; overtime_hours: number; hourly_rate: number | null; rate_source: string | null; rate_verified_at: string | null; calculated_base_wage_cost: number; entry_ids: string[] }>();
  let totalHours = 0;
  let verifiedHours = 0;
  let overtimeHours = 0;
  let calculatedBaseWageCost = 0;

  for (const entry of canonical) {
    const serviceItem = entry.service_item?.trim() || "Unassigned";
    const regularHours = Number(entry.reg_hours ?? 0);
    const overtime = Number(entry.ot_hours ?? 0);
    const hours = regularHours + overtime;
    const rate = Number(entry.hourly_rate) > 0 ? Number(entry.hourly_rate) : null;
    const verified = rate !== null && entry.rate_source?.startsWith("qbo_time_users") === true;
    const baseCost = rate === null ? 0 : hours * rate;
    totalHours += hours;
    overtimeHours += overtime;
    if (verified) verifiedHours += hours;
    calculatedBaseWageCost += baseCost;

    const service = byServiceItem.get(serviceItem) ?? { hours: 0, calculated_cost: 0, entry_ids: [] };
    service.hours += hours;
    service.calculated_cost += baseCost;
    service.entry_ids.push(entry.qbo_entry_id);
    byServiceItem.set(serviceItem, service);

    const employeeKey = `${entry.employee_name}\u0000${rate ?? "missing"}\u0000${entry.rate_source ?? "missing"}`;
    const employee = byEmployeeRate.get(employeeKey) ?? { employee_name: entry.employee_name, regular_hours: 0, overtime_hours: 0, hourly_rate: rate, rate_source: entry.rate_source, rate_verified_at: entry.rate_verified_at, calculated_base_wage_cost: 0, entry_ids: [] };
    employee.regular_hours += regularHours;
    employee.overtime_hours += overtime;
    employee.calculated_base_wage_cost += baseCost;
    employee.entry_ids.push(entry.qbo_entry_id);
    if (entry.rate_verified_at && (!employee.rate_verified_at || entry.rate_verified_at > employee.rate_verified_at)) employee.rate_verified_at = entry.rate_verified_at;
    byEmployeeRate.set(employeeKey, employee);
  }

  return {
    labor_by_service_item: [...byServiceItem.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([service_item, value]) => ({ service_item, hours: roundHours(value.hours), calculated_base_wage_cost: roundMoney(value.calculated_cost), entry_ids: value.entry_ids })),
    employee_rate_evidence: [...byEmployeeRate.values()].sort((a, b) => a.employee_name.localeCompare(b.employee_name)).map((row) => ({ ...row, regular_hours: roundHours(row.regular_hours), overtime_hours: roundHours(row.overtime_hours), calculated_base_wage_cost: roundMoney(row.calculated_base_wage_cost) })),
    rate_coverage: { source: "qbo_time_users.pay_rate", total_hours: roundHours(totalHours), verified_hours: roundHours(verifiedHours), missing_rate_hours: roundHours(totalHours - verifiedHours), complete: totalHours > 0 && Math.abs(totalHours - verifiedHours) < 0.001 },
    overtime_hours: roundHours(overtimeHours),
    overtime_premium_policy: "not_configured" as const,
    calculated_base_wage_cost: roundMoney(calculatedBaseWageCost),
    cost_label: "Calculated direct base wage cost from QBO Time user pay rates; excludes overtime premium, payroll taxes, benefits, and GL reconciliation.",
  };
}

export function buildPostMortemLaborSummary(entries: PostMortemLaborEntry[]) {
  return buildPostMortemLaborEvidence(entries).labor_by_service_item;
}

export function buildPostMortemDataGaps(labor: ReturnType<typeof buildPostMortemLaborEvidence>) {
  const gaps: string[] = [];
  if (labor.labor_by_service_item.some((row) => row.service_item === "Unassigned")) gaps.push("Some labor entries have no service-item/trade coding.");
  if (!labor.rate_coverage.complete) gaps.push(`${labor.rate_coverage.missing_rate_hours} labor hours lack a verified QBO Time pay rate; direct wage cost is incomplete.`);
  if (labor.overtime_hours > 0) gaps.push(`${labor.overtime_hours} overtime hours are present, but the overtime premium rule is not configured; direct wage cost excludes the premium.`);
  return gaps;
}
