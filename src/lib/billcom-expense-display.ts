export interface BillcomExpenseDisplayInput {
  source?: string | null;
  notes?: string | null;
  external_id?: string | null;
  synced_at?: string | null;
}

export interface BillcomExpenseDisplayDetails {
  isBillcom: boolean;
  cardholder: string | null;
  transactionId: string | null;
  transactionIdShort: string | null;
  syncedAt: string | null;
  hasDiscreetDetails: boolean;
}

const CARDHOLDER_REGEX = /Cardholder:\s*([^|]+)/i;

export function getBillcomExpenseDisplayDetails(
  expense: BillcomExpenseDisplayInput,
): BillcomExpenseDisplayDetails {
  const isBillcom = expense.source === "billcom";
  const cardholder = expense.notes?.match(CARDHOLDER_REGEX)?.[1]?.trim() ?? null;
  const transactionId = expense.external_id?.trim() || null;
  const transactionIdShort = transactionId ? transactionId.slice(-10) : null;
  const syncedAt = expense.synced_at?.trim() || null;

  return {
    isBillcom,
    cardholder,
    transactionId,
    transactionIdShort,
    syncedAt,
    hasDiscreetDetails: Boolean(cardholder || transactionIdShort || syncedAt),
  };
}
