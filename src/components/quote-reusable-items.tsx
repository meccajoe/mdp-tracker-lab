'use client';
import styles from './quote-reusable-items.module.css';
import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {insertReusableItem} from '@/lib/quote-reusable-items';
import {prequoteSnapshot} from '@/lib/quote-prequote';
import {quoteItemLabel} from '@/lib/quote-takeoff-grid';
import {QuoteMaterialCell} from './quote-material-cell';
import {useQuoteCatalog} from './use-quote-catalog';
import type {QuoteV27} from '@/lib/quote-v27';
type Entry={item_id:string;title:string;revision:number};
export function QuoteReusableItems({quote,edit,live,onSelect}:{quote:QuoteV27;edit:(fn:(q:QuoteV27)=>void)=>void;live:QuoteV27['catalog']|null;onSelect:(id:string)=>void;save?:()=>void}) {
 const [entries,setEntries]=useState<Entry[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(quote.lines[0]?.id??''),[searchKey,setSearchKey]=useState(0);
 async function load(){try{const response=await adaFetch('/api/prequote-items'),payload=await response.json();if(!response.ok)throw new Error(payload.error);setEntries(payload.items);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not load prequote items.');}}
 useEffect(()=>{void load();},[]);
 async function insert(id:string){setBusy(true);setError('');try{if(!live)throw new Error('Wait for current inventory prices.');const response=await adaFetch(`/api/prequote-items/${id}`),payload=await response.json();if(!response.ok)throw new Error(payload.error);const source=parseQuoteV27(payload.document);let added="";edit(next=>{added=insertReusableItem(next,source,source.lines[0].id,live);});if(added)onSelect(added);setSearchKey(key=>key+1);setNotice(`Inserted ${source.lines[0].name} into the next empty item.`);}catch(e){setError(e instanceof Error?e.message:'Could not insert item.');}finally{setBusy(false);}}
 async function saveItem(){setBusy(true);setError('');try{const document=parseQuoteV27(prequoteSnapshot(quote,selected));const response=await adaFetch(`/api/prequote-items/${crypto.randomUUID()}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:0,document})}),payload=await response.json();if(!response.ok)throw new Error(payload.error);setNotice(`Saved ${document.lines[0].name} to the independent Prequote items library.`);await load();}catch(e){setError(e instanceof Error?e.message:'Could not save item.');}finally{setBusy(false);}}
 return <div className="my-1 text-xs"><div className={styles.toolbar}><label className={styles.search}>Prequote item<QuoteMaterialCell key={searchKey} value="" label="Search prequote items" materials={entries.map(entry=>({id:entry.item_id,name:entry.title,unit:'Reusable item',unitCost:0}))} usage={{}} disabled={busy||!live} hidePrice onPick={id=>{void insert(id);return true;}} commit={()=>true}/></label><a href="/prequote-items" className="underline">Manage library</a><button onClick={()=>void load()} disabled={busy}>Refresh</button><select aria-label="Item to save for reuse" className="max-w-52" value={selected} onChange={e=>setSelected(e.target.value)}>{quote.lines.map(line=><option key={line.id} value={line.id}>{quoteItemLabel(quote,line.id)} — {line.name}</option>)}</select><button disabled={busy||!selected} onClick={()=>void saveItem()}>Save as reusable</button></div>{notice&&<p className={styles.feedback} role="status">{notice}</p>}{error&&<p className={styles.feedback} role="alert">{error}</p>}</div>;
}

export function QuoteReusableToolbar(props:Omit<Parameters<typeof QuoteReusableItems>[0],"live">){const live=useQuoteCatalog();return <QuoteReusableItems {...props} live={live.materials}/>;}
