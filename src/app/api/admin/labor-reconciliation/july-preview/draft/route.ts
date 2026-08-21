import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { buildJulyLaborReview } from "@/lib/july-labor-review";

export async function POST(request: NextRequest) {
  const actor = await requireProjectAdmin(request);
  if (!actor.ok) return actor.response;
  try {
    const body = await request.json().catch(() => ({})) as { projectId?: string };
    const review = await buildJulyLaborReview(actor.supabase, body.projectId ?? null);
    const { data, error } = await actor.supabase.from("labor_allocation_je_reviews").insert({
      period_start: "2026-07-01", period_end: "2026-07-31", roster_snapshot_date: "2026-08-14", source_snapshot: { tie_out: review.tieOut.summary, source_entry_ids: review.sourceEntryIds }, allocation_rows: review.rows, journal_entry_lines: review.journalEntry.lines, exception_rows: review.tieOut.exceptions, source_reconciliation: { employee_source_account_id: "427", contractor_source_account_id: "392", status: "needs_venturity_review" }, debit_total: review.journalEntry.debitTotal, credit_total: review.journalEntry.creditTotal, created_by: actor.actorEmail,
    }).select("id,status,created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ draft: data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save July labor JE draft." }, { status: 500 }); }
}
