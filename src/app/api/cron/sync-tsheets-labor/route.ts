import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called nightly by OpenClaw cron — proxies to the main TSheets sync endpoint
// Syncs last 7 days by default (catches any edits/approvals); full re-sync on Sundays
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const isFullSync = dayOfWeek === 0;

  // Full sync on Sundays (all data back to 2024-01-01); incremental sync covers last 14 days
  const startDate = isFullSync
    ? "2024-01-01"
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const endDate = today.toISOString().split("T")[0];

  const base = new URL(request.url);
  const syncUrl = `${base.protocol}//${base.host}/api/tsheets/sync-labor`;

  const res = await fetch(syncUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate }),
  });

  const result = await res.json();

  console.log(
    `[cron] TSheets sync (${isFullSync ? "full" : "incremental"} ${startDate}→${endDate}):`,
    result
  );

  return NextResponse.json({
    mode: isFullSync ? "full" : "incremental",
    startDate,
    endDate,
    ...result,
  });
}
