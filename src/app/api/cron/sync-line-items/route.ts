import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — full backfill may take a while

// Nightly cron: GET /api/cron/sync-line-items
// Triggered by Vercel cron (see vercel.json) or external cron service.
// Authorization: Bearer $CRON_SECRET
export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
    const response = await fetch(`${baseUrl}/api/line-items/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "all" }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: "Line item sync failed", details: result },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/sync-line-items]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
