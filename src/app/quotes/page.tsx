import { QuoteAccessGate } from "@/components/quote-access-gate";
import { QuoteLibrary } from "@/components/quote-library";

// Authentication uses the browser session; the gate and APIs verify its bearer token.
export default function QuotesPage() {
  return (
    <QuoteAccessGate>
      <QuoteLibrary />
    </QuoteAccessGate>
  );
}
