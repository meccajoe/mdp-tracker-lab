import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

async function main() {
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: draft, error } = await db.from("labor_allocation_je_reviews").select("*").eq("id", process.argv[2]).single();
if (error) throw new Error(error.message);
const out = "/tmp/july-2026-labor-review-package"; mkdirSync(out, { recursive: true });
const csv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
writeFileSync(`${out}/01-je-review.csv`, csv(["Account ID","Project ID","Project","Memo","Debit","Credit"], draft.journal_entry_lines.map((x: any) => [x.accountId,x.projectId,x.projectName,x.memo,x.debit,x.credit])));
writeFileSync(`${out}/02-allocation-detail.csv`, csv(["Project ID","Project","Service Item","Target GL ID","Worker Classification","Hours","Wage Cost"], draft.allocation_rows.map((x: any) => [x.projectId,x.projectName,x.serviceItem,x.targetGlAccountId,x.workerClassification,x.hours,x.wageCost])));
writeFileSync(`${out}/03-exceptions.csv`, csv(["Source Entry ID","Reason"], draft.exception_rows.map((x: any) => [x.id,x.reason])));
const tie = draft.source_snapshot.tie_out;
writeFileSync(`${out}/04-tie-out-summary.csv`, csv(["Metric","Value"], Object.entries(tie)));
const credits = draft.journal_entry_lines.filter((x: any) => x.credit > 0);
writeFileSync(`${out}/05-source-account-reconciliation.csv`, csv(["QBO Account ID","Source Account","Proposed JE Credit","Actual July Source Activity","Variance","Status"], credits.map((x: any) => [x.accountId, x.accountId === "427" ? "600100 Salaries & Wages" : "600150 Contract Labor", x.credit, "", "", "Venturity review required — direct source activity not reconciled"])));
writeFileSync(`${out}/README.txt`, `Mecca July 2026 wage-only labor allocation review package\n\nDraft ID: ${draft.id}\nStatus: ${draft.status}\nPeriod: July 1–31, 2026\nRoster snapshot: August 14, 2026\nDebits: $${draft.debit_total}\nCredits: $${draft.credit_total}\n\nThis is review-only. No QBO Journal Entry was posted.\nEmployee source credit: QBO Account ID 427 (600100 Salaries & Wages).\nContractor source credit: QBO Account ID 392 (600150 Contract Labor).\nSource-account variance must be reviewed with Venturity before manual QBO entry.\n`);
execFileSync("zip", ["-j", "/tmp/july-2026-labor-review-package.zip", `${out}/01-je-review.csv`, `${out}/02-allocation-detail.csv`, `${out}/03-exceptions.csv`, `${out}/04-tie-out-summary.csv`, `${out}/05-source-account-reconciliation.csv`, `${out}/README.txt`]);
console.log(JSON.stringify({ package: "/tmp/july-2026-labor-review-package.zip", draftId: draft.id }));
}
main().catch((error) => { console.error(error); process.exit(1); });
