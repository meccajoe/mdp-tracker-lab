import { notFound } from "next/navigation";

import { QuoteAccessGate } from "@/components/quote-access-gate";
import { QuoteWorkspace } from "@/components/quote-workspace";
import { requireQuoteProductAccess } from "@/lib/ada-server";

export default async function QuoteWorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const access = await requireQuoteProductAccess();
  if (!access.ok) notFound();
  const { workspaceId } = await params;
  return (
    <QuoteAccessGate>
      <QuoteWorkspace workspaceId={workspaceId} />
    </QuoteAccessGate>
  );
}
