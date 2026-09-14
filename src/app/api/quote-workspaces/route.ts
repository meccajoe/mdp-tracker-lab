import type { NextRequest } from "next/server";
import { GET as adaGet, POST as adaPost } from "@/app/api/ada/workspaces/route";
import { requireQuoteProductAccess } from "@/lib/ada-server";

export async function GET(request: NextRequest) {
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  return adaGet(request);
}

export async function POST(request: NextRequest) {
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  return adaPost(request);
}
