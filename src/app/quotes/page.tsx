import { QuoteAccessGate } from "@/components/quote-access-gate";
import { QuoteLibrary } from "@/components/quote-library";

export default function QuotesPage() {
  return (
    <QuoteAccessGate>
      <QuoteLibrary />
    </QuoteAccessGate>
  );
}
