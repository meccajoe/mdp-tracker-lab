'use client';
import {useState} from 'react';
import {loadQuoteLibrary} from '@/lib/quote-library-client';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {insertReusableItem} from '@/lib/quote-reusable-items';
import {quoteItemLabel} from '@/lib/quote-takeoff-grid';
import type {QuoteV27} from '@/lib/quote-v27';
type Entry={workspace:string;document:QuoteV27;lineId:string};
export function QuoteReusableItems({quote,edit,live,onSelect,save}:{quote:QuoteV27;edit:(fn:(q:QuoteV27)=>void)=>void;live:QuoteV27['catalog']|null;onSelect:(id:string)=>void;save:()=>void}) {
  const [open,setOpen]=useState(false),[entries,setEntries]=useState<Entry[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[selected,setSelected]=useState(quote.lines[0]?.id??'');
  async function load(){setOpen(true);setLoading(true);setError('');try{
    const {quotes,failures}=await loadQuoteLibrary();const found:Entry[]=quotes.flatMap(saved=>(saved.document.reusableItemIds??[]).map(lineId=>({workspace:saved.workspace,document:saved.document,lineId})));
    setEntries(found);if(failures)setError(`${failures} quote(s) could not be checked. Refresh to retry.`);
  }catch(e){setError(e instanceof Error?e.message:'Could not load saved items.');}finally{setLoading(false);}}
  return <div className="my-2 rounded border bg-blue-50 p-2 text-xs"><button type="button" className="rounded border bg-white px-2 py-1" onClick={()=>void load()}>Search prequote items</button>
    <select aria-label="Item to save for reuse" value={selected} onChange={e=>setSelected(e.target.value)}>{quote.lines.map(line=><option key={line.id} value={line.id}>{quoteItemLabel(quote,line.id)} — {line.name}</option>)}</select>
    <button type="button" className="rounded border bg-white px-2 py-1" onClick={()=>{edit(next=>{next.reusableItemIds=[...new Set([...(next.reusableItemIds??[]),selected])];});save();}}>Save as reusable item</button>
    {open&&<div role="dialog" aria-label="Prequote item library" className="mt-2 rounded border bg-white p-3"><button type="button" onClick={()=>setOpen(false)}>Close library</button><input aria-label="Search prequote items" placeholder="Search saved item names…" value={query} onChange={e=>setQuery(e.target.value)}/><p>Saved quote items · Current inventory prices on insertion; custom costs and explicit item overrides are retained. Source quotes remain unchanged.</p>{loading&&<p>Loading saved items…</p>}{error&&<p role="alert">{error}</p>}{!loading&&!entries.length&&<p>No reusable items saved yet.</p>}
      {entries.filter(entry=>entry.document.lines.find(line=>line.id===entry.lineId)?.name.toLowerCase().includes(query.toLowerCase())).map(entry=><button type="button" key={`${entry.workspace}-${entry.lineId}`} disabled={!live} className="block w-full border-b p-2 text-left" onClick={()=>{try{if(!live)throw new Error('Wait for current inventory prices.');const next=structuredClone(quote);const id=insertReusableItem(next,entry.document,entry.lineId,live);edit(q=>Object.assign(q,next));onSelect(id);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Could not insert item.');}}}>{entry.document.lines.find(line=>line.id===entry.lineId)?.name} · from {entry.workspace}</button>)}{!live&&<p>Live inventory must be available before inserting an item.</p>}</div>}
  </div>;
}
