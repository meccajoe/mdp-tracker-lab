import {QuoteAccessGate} from '@/components/quote-access-gate';
import {TrackerCatalog} from '@/components/tracker-catalog';
export default function Page(){return <QuoteAccessGate><main className="p-4"><a className="underline" href="/quotes">Back to quotes</a><TrackerCatalog/></main></QuoteAccessGate>;}
