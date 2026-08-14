import { NextResponse } from "next/server";
import { requireAdaAccess } from "@/lib/ada-server";

export async function GET() {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;
  return NextResponse.json({ allowed: true, actorEmail: access.actorEmail });
}
