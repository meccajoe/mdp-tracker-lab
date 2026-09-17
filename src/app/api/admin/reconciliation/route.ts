import { NextRequest, NextResponse } from "next/server";

import { loadFinancialReconciliationPayload } from "@/lib/financial-reconciliation-server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: NextRequest) {
  const admin = await requireProjectAdmin(request);
  if (!admin.ok) return admin.response;

  const asOfDate = request.nextUrl.searchParams.get("asOfDate") ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(asOfDate)) return NextResponse.json({ error: "Invalid as-of date." }, { status: 400 });

  try {
    const payload = await loadFinancialReconciliationPayload(admin.supabase, asOfDate);
    const search = (request.nextUrl.searchParams.get("search") ?? "").trim().toLowerCase();
    const projectStatus = request.nextUrl.searchParams.get("projectStatus") ?? "all";
    const queueStatus = request.nextUrl.searchParams.get("queueStatus") ?? "all";
    const category = request.nextUrl.searchParams.get("category") ?? "all";
    const owner = request.nextUrl.searchParams.get("owner") ?? "all";
    const freshness = request.nextUrl.searchParams.get("freshness") ?? "all";
    const materialOnly = request.nextUrl.searchParams.get("materialOnly") === "true";

    const rows = payload.rows.filter((row) => {
      if (projectStatus !== "all" && row.project.status !== projectStatus) return false;
      if (queueStatus !== "all" && row.queueStatus !== queueStatus && row.caseState?.status !== queueStatus) return false;
      const effectiveCategory = row.caseState?.category ?? row.category;
      if (category !== "all" && effectiveCategory !== category) return false;
      if (owner !== "all" && (row.caseState?.ownerEmail ?? row.projectOwnerEmail ?? "unassigned") !== owner) return false;
      if (freshness !== "all" && row.freshness.status !== freshness) return false;
      if (materialOnly && !row.revenueVariance.material && !row.costVariance.material) return false;
      if (search) {
        const haystack = [row.project.id, row.project.jobNumber, row.project.name, row.project.client, row.project.owner]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    return NextResponse.json({ ...payload, rows, filteredCount: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Accounting Review." }, { status: 500 });
  }
}
