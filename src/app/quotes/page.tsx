import { notFound } from "next/navigation";

import { QuoteAccessGate } from "@/components/quote-access-gate";
import { QuoteLibrary } from "@/components/quote-library";
import { requireQuoteProductAccess } from "@/lib/ada-server";

export default async function QuotesPage() {
  const access = await requireQuoteProductAccess();
  if (!access.ok) notFound();
  return (
    <QuoteAccessGate>
      <QuoteLibrary />
    </QuoteAccessGate>
  );
}
