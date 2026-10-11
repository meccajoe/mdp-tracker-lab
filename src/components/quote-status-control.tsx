'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
export function QuoteStatusControl({workspaceId,revision,dirty,onChanged}:{workspaceId:string;revision:number;dirty:boolean;onChanged:()=>void}){
 const [data,setData]=useState<{status:string;version:number;revision:number;canEdit:boolean}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const guard=useRef(false);
 const load=useCallback(async()=>{try{const r=await adaFetch(`/api/quote-workspaces/${workspaceId}/status`),p=await r.json();if(!r.ok)throw new Error(p.error);setData(p);setError('');}catch(e){setData(null);setError(e instanceof Error?e.message:'Status unavailable.');}},[workspaceId]);
 useEffect(()=>{void load();},[load,revision]);
 async function change(status:string){if(!data||guard.current)return;guard.current=true;setBusy(true);setError('');try{const r=await adaFetch(`/api/quote-workspaces/${workspaceId}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,expectedVersion:data.version,expectedRevision:revision})}),p=await r.json();if(!r.ok)throw new Error(p.error);await load();onChanged();}catch(e){setError(e instanceof Error?e.message:'Status could not change.');}finally{guard.current=false;setBusy(false);}}
 return <div className="text-xs"><label>Quote status <select aria-label="Quote status" className="rounded border bg-background px-2 py-1" value={data?.status??'draft'} disabled={!data?.canEdit||busy||dirty||!revision} onChange={e=>void change(e.target.value)}><option value="draft">Draft</option><option value="final">Final</option></select></label><span className="ml-2">{dirty?'Save changes before changing status.':data?.status==='final'?'Final — switch to Draft to edit.':busy?'Creating CAD Turnover…':'Final creates a CAD Turnover PDF. Separate from Capacity forecast.'}</span>{error?<p role="alert" className="text-amber-800">{error}</p>:null}</div>;
}
