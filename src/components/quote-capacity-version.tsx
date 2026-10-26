'use client';
import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {invalidateQuoteLibrary} from '@/lib/quote-library-client';
export function QuoteCapacityVersion({workspaceId,disabled=false,onChanged}:{workspaceId:string;disabled?:boolean;onChanged?:()=>void}){
 const [allowed,setAllowed]=useState(false);
 const [entry,setEntry]=useState<{selected:boolean;version:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){try{const r=await adaFetch(`/api/quote-workspaces/${workspaceId}/capacity-version`),p=await r.json();if(!r.ok)throw Error(p.error);setEntry(p.entry);setAllowed(p.canSelect);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[workspaceId]);
 async function select(){if(!entry||busy)return;setBusy(true);setError('');try{const r=await adaFetch(`/api/quote-workspaces/${workspaceId}/capacity-version`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'select',expectedVersion:entry.version})}),p=await r.json();if(!r.ok)throw Error(p.error);invalidateQuoteLibrary();await load();onChanged?.();}catch(e){setError((e as Error).message);await load();}finally{setBusy(false);}}
 return <div className="text-xs"><button className="rounded border px-2 py-1" disabled={disabled||!allowed||busy||!entry||entry.selected} onClick={()=>void select()}>{busy?'Saving…':entry?.selected?'✓ Used for Capacity':'Use for Capacity'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
