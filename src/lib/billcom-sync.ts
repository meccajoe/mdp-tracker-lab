export interface BillcomSyncTransaction {
  transactionType: "CLEAR" | "AUTHORIZATION" | "DECLINE" | string;
  status: "COMPLETE" | "INCOMPLETE" | "PTR_INCOMPLETE" | "PENDING" | "DECLINED" | string;
  originalAuthTransactionUuid?: string | null;
}

export function shouldSyncBillcomTransaction(tx: BillcomSyncTransaction): boolean {
  return tx.transactionType === "CLEAR" && tx.status === "COMPLETE";
}

export function getBillcomOriginalAuthExternalIdsToDelete(
  tx: BillcomSyncTransaction,
): string[] {
  if (tx.transactionType !== "CLEAR") return [];

  const originalAuthUuid = tx.originalAuthTransactionUuid?.trim();
  return originalAuthUuid ? [originalAuthUuid] : [];
}
