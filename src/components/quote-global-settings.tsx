'use client';
import {confirmAction} from './confirm-action';
import {useEffect,useRef,useState} from 'react';
import {QuoteSectionNav} from './quote-section-nav';
import {adaFetch} from '@/lib/ada-client';
import {QuoteRates} from './quote-rates';
import {PageShell} from './ui/page-shell';
import {Button} from './ui/button';
import {calculateQuoteV27,type QuoteV27} from '@/lib/quote-v27';
import {quoteDefaults,quoteFromDefaults} from '@/lib/quote-defaults';
export function QuoteGlobalSettings(){
 const [quote,setQuote]=useState<QuoteV27|null>(null),[version,setVersion]=useState(0),[saved,setSaved]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[canEdit,setCanEdit]=useState(false);
 const guard=useRef(false);
 const dirty=!!quote&&JSON.stringify(quoteDefaults(quote))!==saved;
 async function load(){setBusy(true);setError('');try{const r=await adaFetch('/api/quote-settings'),p=await r.json();if(!r.ok)throw new Error(p.error);const q=quoteFromDefaults(p.document);setQuote(q);setSaved(JSON.stringify(quoteDefaults(q)));setVersion(p.version);setCanEdit(p.canEdit);}catch(e){setError(e instanceof Error?e.message:'Settings could not load.');}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 let calculation:ReturnType<typeof calculateQuoteV27>|null=null,calculationError='';try{if(quote)calculation=calculateQuoteV27(quote);}catch(e){calculationError=e instanceof Error?e.message:'Invalid settings.';}
 async function save(){if(!quote||guard.current)return;guard.current=true;setBusy(true);setError('');try{const document=quoteDefaults(quoteFromDefaults(quoteDefaults(quote)));const r=await adaFetch('/api/quote-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document,expectedVersion:version})}),p=await r.json();if(!r.ok)throw new Error(p.error);setVersion(p.version);setSaved(JSON.stringify(document));setMessage('Global Settings saved. Only quotes created from now on use these defaults.');}catch(e){setError(e instanceof Error?e.message:'Settings could not save.');}finally{guard.current=false;setBusy(false);}}
 return <PageShell><h1 className="text-2xl font-bold">Quotes — Global Settings</h1><QuoteSectionNav beforeNavigate={async ()=>!dirty||await confirmAction('Leave without saving global settings?')}/><p>These are starting settings for new quotes. Existing quotes, clones and spreadsheet imports keep their own saved settings. Each quote still has its own Settings tab.</p>
 <div className="flex gap-3"><Button disabled={busy||!canEdit||!dirty||!!calculationError} onClick={()=>void save()}>Save global settings</Button><Button variant="outline" disabled={busy} onClick={async ()=>{if(!dirty||await confirmAction('Discard unsaved global settings and reload?'))void load();}}>Reload saved settings</Button></div>
 {error||calculationError?<p role="alert" className="text-red-700">{error||calculationError}</p>:null}{message?<p role="status">{message}</p>:null}
 {quote?<fieldset disabled={busy||!canEdit}><QuoteRates quote={quote} laborRate={calculation?.laborRate??null} edit={fn=>{setQuote(previous=>{const next=structuredClone(previous!);fn(next);return next;});setMessage('');}}/></fieldset>:null}</PageShell>;
}
