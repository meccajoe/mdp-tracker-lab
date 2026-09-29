import { QuoteAccessGate } from "@/components/quote-access-gate";
import { QuoteWorkspace } from "@/components/quote-workspace";

export default async function QuoteWorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return (
    <QuoteAccessGate>
      <QuoteWorkspace workspaceId={workspaceId} />
    </QuoteAccessGate>
  );
}
