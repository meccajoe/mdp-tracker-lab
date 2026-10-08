import Link from 'next/link';
import {QuoteAccessGate} from '@/components/quote-access-gate';
import {QuoteSpreadsheetImport} from '@/components/quote-spreadsheet-import';
export default function ImportQuotePage(){return <QuoteAccessGate><main className="max-w-5xl mx-auto p-5 space-y-4"><Link className="underline" href="/quotes">← Quotes</Link><QuoteSpreadsheetImport/></main></QuoteAccessGate>;}
