import { NextRequest, NextResponse } from "next/server";

import { FINANCIAL_RECONCILIATION_CONTRACT_VERSION } from "@/lib/financial-reconciliation";
import { loadFinancialReconciliationPayload } from "@/lib/financial-reconciliation-server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: NextRequest) {
  const admin = await requireProjectAdmin(request);
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => ({})) as { asOfDate?: string; projectId?: string };
  const asOfDate = body.asOfDate ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(asOfDate)) return NextResponse.json({ error: "Invalid as-of date." }, { status: 400 });

  try {
    const payload = await loadFinancialReconciliationPayload(admin.supabase, asOfDate);
    const rows = body.projectId ? payload.rows.filter((row) => row.project.id === body.projectId) : payload.rows;
    if (body.projectId && rows.length === 0) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    let observed = 0;
    let cleared = 0;
    for (const row of rows) {
      if (row.queueStatus === "ready") {
        const { data, error } = await admin.supabase.rpc("supersede_financial_reconciliation_cases", {
          p_project_id: row.project.id,
          p_actor_email: admin.actorEmail,
          p_reason: "The latest complete scan found no actionable reconciliation condition.",
        });
        if (error) throw error;
        cleared += Number(data ?? 0);
        continue;
      }

      const { error } = await admin.supabase.rpc("observe_financial_reconciliation_case", {
        p_project_id: row.project.id,
        p_as_of_date: asOfDate,
        p_category: row.category,
        p_severity: row.severity,
        p_metric_contract_version: FINANCIAL_RECONCILIATION_CONTRACT_VERSION,
        p_fingerprint: row.fingerprint,
        p_reason: row.reason,
        p_next_action: row.nextAction,
        p_review_reasons: row.reviewReasons,
        p_metric_snapshot: {
          tracker: row.tracker,
          qbo: row.qbo,
          laborCoverage: row.laborCoverage,
          revenueVariance: row.revenueVariance,
          costVariance: row.costVariance,
          freshness: row.freshness,
        },
        p_source_snapshot: {
          project: row.project,
          asOfDate,
          qboSource: row.qbo.sourceLabel,
          trackerSource: row.tracker.sourceLabel,
        },
        p_actor_email: admin.actorEmail,
        p_scan_scope_complete: true,
        p_reopen_resolved: false,
      });
      if (error) throw error;
      observed++;
    }

    const refreshed = await loadFinancialReconciliationPayload(admin.supabase, asOfDate);
    return NextResponse.json({ ...refreshed, scan: { observed, cleared, scanned: rows.length } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not refresh Accounting Review." }, { status: 500 });
  }
}
