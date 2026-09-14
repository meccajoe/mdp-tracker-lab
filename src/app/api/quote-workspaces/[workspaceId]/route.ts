import { DELETE as adaDelete, GET as adaGet, PATCH as adaPatch } from "@/app/api/ada/workspaces/[workspaceId]/route";
import { requireQuoteProductAccess } from "@/lib/ada-server";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  return adaGet(request, context);
}

export async function PATCH(request: Request, context: Context) {
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  return adaPatch(request, context);
}

export async function DELETE(request: Request, context: Context) {
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  return adaDelete(request, context);
}
