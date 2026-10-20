'use client';
import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {invalidateQuoteLibrary} from '@/lib/quote-library-client';
export function QuoteClientName({workspaceId,disabled}:{workspaceId:string;disabled:boolean}){
 const [saved,setSaved]=useState(''),[value,setValue]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 const endpoint=`/api/quote-workspaces/${workspaceId}/client`;
 useEffect(()=>{let active=true;void adaFetch(endpoint).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(active){setSaved(data.clientName);setValue(data.clientName);setLoaded(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[endpoint]);
 async function save(){setBusy(true);setError('');try{const r=await adaFetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientName:value,expectedClientName:saved})}),data=await r.json();if(!r.ok)throw Error(data.error);setSaved(data.clientName);setValue(data.clientName);setEditing(false);invalidateQuoteLibrary();}catch(e){setError(e instanceof Error?e.message:'Save failed.');}finally{setBusy(false);}}
 return <div className="my-2 text-sm">{editing?<div className="flex gap-2 items-center"><label>Client Name<input aria-label="Client Name" className="ml-2 rounded border p-1" maxLength={300} value={value} onChange={e=>setValue(e.target.value)} disabled={busy}/></label><button disabled={disabled||busy||!value.trim()} onClick={()=>void save()}>Save client</button><button disabled={busy} onClick={()=>{setEditing(false);setValue(saved);}}>Cancel</button></div>:<><strong>Client: </strong>{saved||'—'} <button className="ml-2 underline" disabled={disabled||!loaded} onClick={()=>setEditing(true)}>Edit client</button></>}{error&&<p role="alert">{error}</p>}</div>;
}
