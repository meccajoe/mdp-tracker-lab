import {QuoteAccessGate} from '@/components/quote-access-gate';
import {PrequoteEditor} from '@/components/prequote-editor';
export default async function Page({params}:{params:Promise<{itemId:string}>}){return <QuoteAccessGate><PrequoteEditor id={(await params).itemId}/></QuoteAccessGate>;}
