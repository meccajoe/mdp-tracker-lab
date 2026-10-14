'use client';
import {useRef,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {Button} from './ui/button';

export function QuoteCadDownload({workspaceId,version}:{workspaceId:string;version:number}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  async function download(){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');
    try{
      const response=await adaFetch(`/api/quote-workspaces/${workspaceId}/cad-turnover?version=${version}`);
      if(!response.ok){const data=await response.json();throw new Error(data.error||'Download failed.');}
      const blob=await response.blob(),url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=url;
      anchor.download=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]??'CAD-Turnover.pdf';
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
    }catch(e){setError(e instanceof Error?e.message:'CAD Turnover could not download.');}
    finally{pending.current=false;setBusy(false);}
  }
  return <div><Button size="sm" variant="outline" disabled={busy} onClick={()=>void download()}>{busy?'Downloading…':'CAD Turnover'}</Button>{error?<p role="alert" className="max-w-xs text-xs text-red-700">{error}</p>:null}</div>;
}
