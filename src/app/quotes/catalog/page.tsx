import {QuoteAccessGate} from '@/components/quote-access-gate';
import {QuoteSectionNav} from '@/components/quote-section-nav';
import {TrackerCatalog} from '@/components/tracker-catalog';
export default function Page(){return <QuoteAccessGate><main className="p-4"><QuoteSectionNav/><TrackerCatalog/></main></QuoteAccessGate>;}
