import { APPROVED_LABOR_SERVICE_ITEM_GL } from "./july-labor-allocation-grid";
import { normalizeLaborServiceItem } from "./labor-service-item";

type QboItem = { name: string; expenseAccountId: string | null; expenseAccountName: string | null };

export function auditLaborItemGl(items: QboItem[]) {
  return items.map((item) => {
    const displayName = normalizeLaborServiceItem(item.name) ?? item.name;
    const expectedGlAccountId = APPROVED_LABOR_SERVICE_ITEM_GL[displayName] ?? null;
    const status = !item.expenseAccountId ? "missing_qbo_expense_gl" : !expectedGlAccountId ? "unmapped_service_item" : item.expenseAccountId === expectedGlAccountId ? "matched" : "mismatch";
    return { displayName, qboItemName: item.name, expectedGlAccountId, qboExpenseAccountId: item.expenseAccountId, qboExpenseAccountName: item.expenseAccountName, status };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
