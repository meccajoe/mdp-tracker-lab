import { NextResponse } from "next/server";

import { requireQuoteProductAccess } from "@/lib/ada-server";

export async function GET() {
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  return NextResponse.json({ allowed: true, actorEmail: access.actorEmail });
}
