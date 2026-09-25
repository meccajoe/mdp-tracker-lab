import { NextRequest, NextResponse } from "next/server";
import { assertLabEnvironment, isLabBlockedPath } from "./lib/lab-safety.mjs";

export function proxy(request: NextRequest) {
  try { assertLabEnvironment(process.env); }
  catch { return NextResponse.json({ error: "Lab configuration is incomplete or unsafe." }, { status: 503 }); }
  if (isLabBlockedPath(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "This external integration is disabled in Tracker Lab.", code: "LAB_INTEGRATION_DISABLED" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/auth/:path*"] };
