import { NextRequest, NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";

const ALLOWED_STATUSES = new Set(["new", "assigned", "investigating", "waiting_on_pm", "waiting_on_accounting", "resolved"]);

export async function GET(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const admin = await requireProjectAdmin(request);
  if (!admin.ok) return admin.response;
  const caseId = (await context.params).caseId;

  const [caseResult, eventsResult] = await Promise.all([
    admin.supabase.from("financial_reconciliation_cases").select("*").eq("id", caseId).maybeSingle(),
    admin.supabase.from("financial_reconciliation_case_events").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
  ]);
  const error = caseResult.error ?? eventsResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!caseResult.data) return NextResponse.json({ error: "Reconciliation case not found." }, { status: 404 });
  return NextResponse.json({ reconciliationCase: caseResult.data, events: eventsResult.data ?? [] });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const admin = await requireProjectAdmin(request);
  if (!admin.ok) return admin.response;
  const caseId = (await context.params).caseId;
  const body = await request.json().catch(() => ({})) as {
    rowVersion?: number;
    status?: string;
    ownerEmail?: string | null;
    resolutionCode?: string;
    resolutionNotes?: string;
    comment?: string;
  };

  if (!Number.isInteger(body.rowVersion) || Number(body.rowVersion) < 1) {
    return NextResponse.json({ error: "Current case version is required." }, { status: 400 });
  }
  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Invalid review status." }, { status: 400 });
  }
  if (body.status === "resolved" && (!body.resolutionCode?.trim() || !body.resolutionNotes?.trim())) {
    return NextResponse.json({ error: "Resolution type and notes are required." }, { status: 400 });
  }
  if (!body.status && body.ownerEmail === undefined && !body.comment?.trim()) {
    return NextResponse.json({ error: "No supported case changes supplied." }, { status: 400 });
  }

  const { data, error } = await admin.supabase.rpc("transition_financial_reconciliation_case", {
    p_case_id: caseId,
    p_expected_row_version: body.rowVersion,
    p_actor_email: admin.actorEmail,
    p_status: body.status ?? null,
    p_owner_email: body.ownerEmail === undefined ? null : body.ownerEmail ?? "",
    p_resolution_code: body.resolutionCode?.trim() || null,
    p_resolution_notes: body.resolutionNotes?.trim() || null,
    p_comment: body.comment?.trim() || null,
  });
  if (error) {
    const status = error.code === "PT409" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ reconciliationCase: data });
}
