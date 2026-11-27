'use client';

import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';

export function QuoteBudgetControl({workspaceId,revision,dirty,saving}:{
 workspaceId:string;revision:number;dirty:boolean;saving:boolean;
}){
 const [state,setState]=useState<{pending:boolean;canEdit:boolean}|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const endpoint=`/api/quote-workspaces/${encodeURIComponent(workspaceId)}/budget-control`;
 useEffect(()=>{
  let current=true;
  setState(null);setError('');
  adaFetch(endpoint).then(async response=>{
   if(!response.ok)throw Error('Budget approval could not load.');
   const result=await response.json();
   if(current)setState(result);
  }).catch((err:Error)=>{if(current)setError(err.message);});
  return()=>{current=false;};
 },[endpoint]);

 async function change(){
  if(!state||busy||saving||revision<1||(state.pending&&dirty))return;
  setBusy(true);setError('');
  try{
   const response=await adaFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({revision,pending:!state.pending})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Budget approval could not be updated.');
   setState({...state,pending:result.pending});
  }catch(err){setError(err instanceof Error?err.message:'Budget approval could not be updated.');}
  finally{setBusy(false);}
 }

 return <section aria-label="Project budget approval" className="mb-4 flex flex-wrap items-center gap-3 text-sm">
  {state&&<span role="status">Project budget {state.pending?'Pending':'Approved'}</span>}
  {state?.canEdit&&<button type="button" className="rounded border px-3 py-1 disabled:opacity-50"
   disabled={busy||saving||revision<1||(state.pending&&dirty)}
   onClick={()=>void change()}>{state.pending?'Release saved revision':'Mark Pending'}</button>}
  {state?.pending&&dirty&&<span>Save your edits before releasing the revision.</span>}
  {error&&<span role="alert">{error}</span>}
 </section>;
}
