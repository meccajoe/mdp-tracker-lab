import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Call the sync-labor route internally (sync all active projects)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004";
    const response = await fetch(`${baseUrl}/api/qbo/sync-labor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: "Sync failed", details: result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Cron sync-qbo-labor error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
