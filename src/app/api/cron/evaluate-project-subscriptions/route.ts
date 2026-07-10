import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { evaluateProjectSubscriptions } from "@/lib/project-subscription-evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const force = request.nextUrl.searchParams.get("force") === "1";
  const projectId = request.nextUrl.searchParams.get("projectId");
  const subscriptionId = request.nextUrl.searchParams.get("subscriptionId");

  const supabase = getSupabaseAdmin();
  const evaluated = await evaluateProjectSubscriptions({
    supabase,
    dryRun,
    force,
    projectId,
    subscriptionId,
  });

  if (evaluated.error) {
    return NextResponse.json({ error: evaluated.error }, { status: 500 });
  }

  const summary = evaluated.results.reduce(
    (acc, result) => {
      acc.total += 1;
      acc[result.outcome] = (acc[result.outcome] ?? 0) + 1;
      return acc;
    },
    {
      total: 0,
      triggered: 0,
      skipped: 0,
      error: 0,
      would_trigger: 0,
    } as Record<string, number>
  );

  return NextResponse.json({
    ok: true,
    dryRun,
    force,
    summary,
    results: evaluated.results,
  });
}
