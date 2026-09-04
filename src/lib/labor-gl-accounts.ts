export const QBO_LABOR_GL_ACCOUNT_DISPLAY: Record<string, string> = {
  "105": "500600 COS - Labor:COS - Graphics",
  "110": "500110 COS - Labor:COS - Contract Labor",
  "231": "500100 COS - Labor:COS - Production Labor",
  "392": "600150 Payroll Expenses:Salaries & wages:Contract Labor",
  "427": "600100 Payroll Expenses:Salaries & wages",
};

export function getLaborGlAccountDisplay(accountId: string): string {
  return QBO_LABOR_GL_ACCOUNT_DISPLAY[accountId] ?? `QBO Account ${accountId}`;
}
