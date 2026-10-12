'use client';
import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {insertReusableItem} from '@/lib/quote-reusable-items';
import type {QuoteV27} from '@/lib/quote-v27';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
type Entry={item_id:string;title:string;revision:number};
export function QuoteExistingItemDialog({open,onOpenChange,quote,edit,live,readOnly,onInserted}:{open:boolean;onOpenChange:(open:boolean)=>void;quote:QuoteV27;edit:(change:(next:QuoteV27)=>void)=>void;live:QuoteV27['catalog']|null;readOnly:boolean;onInserted:(id:string)=>void}){
 const [items,setItems]=useState<Entry[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[inserting,setInserting]=useState(false);
 useEffect(()=>{if(!open)return;let active=true;setQuery('');setError('');setItems([]);setLoading(true);void (async()=>{try{const response=await adaFetch('/api/prequote-items'),data=await response.json();if(!response.ok)throw new Error(data.error);if(active)setItems(data.items);}catch(error){if(active)setError(error instanceof Error?error.message:'Could not load existing items.');}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[open]);
 async function insert(id:string){if(readOnly||inserting||!live)return;setInserting(true);setError('');try{const response=await adaFetch(`/api/prequote-items/${id}`),data=await response.json();if(!response.ok)throw new Error(data.error);const source=parseQuoteV27(data.document);let added='';edit(next=>{added=insertReusableItem(next,source,source.lines[0].id,live);});onInserted(added);onOpenChange(false);}catch(error){setError(error instanceof Error?error.message:'Could not add existing item.');}finally{setInserting(false);}}
 const matches=items.filter(item=>item.title.toLowerCase().includes(query.toLowerCase()));
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent onKeyDown={event=>event.stopPropagation()}>
  <DialogTitle>Add Existing Item</DialogTitle><DialogDescription>Choose a saved prequote item. It will fill the next empty item and takeoff rows using current inventory prices.</DialogDescription>
  <input autoFocus aria-label="Search existing items" placeholder="Search items…" className="rounded border p-2" value={query} onChange={event=>setQuery(event.target.value)}/>
  {error&&<p role="alert">{error}</p>}{!live&&<p role="status">Waiting for current inventory prices…</p>}
  <div className="max-h-80 overflow-y-auto" aria-label="Existing items">{loading?<p role="status">Loading saved items…</p>:matches.map(item=><button type="button" className="block w-full rounded border-b p-3 text-left hover:bg-accent" key={item.item_id} disabled={readOnly||inserting||!live} onClick={()=>void insert(item.item_id)}>{item.title}</button>)}{!loading&&!error&&!matches.length&&<p>{items.length?'No matching items.':'No saved prequote items yet. Use Save as prequote item on an item’s menu.'}</p>}</div>
  <a href="/prequote-items" className="text-xs underline">Manage saved prequote items</a>
 </DialogContent></Dialog>;
}
