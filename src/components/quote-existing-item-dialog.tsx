'use client';
import {useEffect,useMemo,useId,useRef,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {insertReusableItem} from '@/lib/quote-reusable-items';
import type {QuoteV27} from '@/lib/quote-v27';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
type Entry={item_id:string;title:string;revision:number};
export function QuoteExistingItemDialog({open,onOpenChange,quote,edit,live,readOnly,onInserted}:{open:boolean;onOpenChange:(open:boolean)=>void;quote:QuoteV27;edit:(change:(next:QuoteV27)=>void)=>void;live:QuoteV27['catalog']|null;readOnly:boolean;onInserted:(id:string)=>void}){
 const listId=useId(),list=useRef<HTMLDivElement>(null),inFlight=useRef(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [items,setItems]=useState<Entry[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[inserting,setInserting]=useState(false);
 useEffect(()=>{if(!open)return;let active=true;setQuery('');setSelected(null);setError('');setItems([]);setLoading(true);void (async()=>{try{const response=await adaFetch('/api/prequote-items'),data=await response.json();if(!response.ok)throw new Error(data.error);if(active)setItems(data.items);}catch(error){if(active)setError(error instanceof Error?error.message:'Could not load existing items.');}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[open]);
 async function insert(id:string){if(readOnly||inFlight.current||!live)return;inFlight.current=true;setInserting(true);setError('');try{const response=await adaFetch(`/api/prequote-items/${id}?purpose=insert`),data=await response.json();if(!response.ok)throw new Error(data.error);const source=parseQuoteV27(data.document);let added='';edit(next=>{added=insertReusableItem(next,source,source.lines[0].id,live);});onInserted(added);onOpenChange(false);}catch(error){setError(error instanceof Error?error.message:'Could not add existing item.');}finally{inFlight.current=false;setInserting(false);}}
 const indexed=useMemo(()=>items.map(item=>({item,title:item.title.toLowerCase()})),[items]);
 const matches=useMemo(()=>{const term=query.trim().toLowerCase();return indexed.filter(row=>row.title.includes(term)).map(row=>row.item);},[indexed,query]);
 const activeIndex=matches.findIndex(item=>item.item_id===selected);
 const unavailable=readOnly||loading||inserting||!live;
 useEffect(()=>{if(open&&activeIndex>=0)list.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({block:'nearest'});},[open,activeIndex]);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent onKeyDown={event=>event.stopPropagation()}>
  <DialogTitle>Add Existing Item</DialogTitle><DialogDescription>Choose a saved quoted item. It will fill the next empty item and takeoff rows using current inventory prices.</DialogDescription>
  <input autoFocus role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={activeIndex>=0?`${listId}-${activeIndex}`:undefined} aria-describedby={`${listId}-hint`} aria-label="Search existing items" placeholder="Search items…" className="rounded border p-2" value={query} onChange={event=>{setQuery(event.target.value);setSelected(null);}} onKeyDown={event=>{
   if(event.nativeEvent.isComposing)return;
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();event.stopPropagation();if(unavailable||!matches.length)return;
    const index=event.key==='ArrowDown'?(activeIndex+1)%matches.length:activeIndex<=0?matches.length-1:activeIndex-1;
    setSelected(matches[index].item_id);
   }else if(event.key==='Enter'){
    event.preventDefault();event.stopPropagation();if(!unavailable&&activeIndex>=0)void insert(matches[activeIndex].item_id);
   }
  }}/>
  <p id={`${listId}-hint`} className="text-xs text-muted-foreground">Type to search · ↑ ↓ to select · Enter to add the highlighted item</p>
  {inserting&&<p role="status">Adding selected item…</p>}{error&&<p role="alert">{error}</p>}{!live&&<p role="status">Waiting for current inventory prices…</p>}
  <div ref={list} id={listId} role="listbox" aria-busy={loading||inserting} className="max-h-80 overflow-y-auto" aria-label="Existing items">{loading?<p role="status">Loading saved items…</p>:matches.map((item,index)=><button type="button" role="option" aria-selected={selected===item.item_id} id={`${listId}-${index}`} data-index={index} className={`block w-full rounded border-b p-3 text-left ${selected===item.item_id?'bg-accent text-accent-foreground':'hover:bg-muted'}`} key={item.item_id} disabled={readOnly||inserting||!live} onClick={()=>void insert(item.item_id)}>{item.title}</button>)}{!loading&&!error&&!matches.length&&<p>{items.length?'No matching items.':'No saved Quoted Item Database yet. Use Save as quoted item on an item’s menu.'}</p>}</div>
  <a href="/prequote-items" className="text-xs underline">Manage saved Quoted Item Database</a>
 </DialogContent></Dialog>;
}
