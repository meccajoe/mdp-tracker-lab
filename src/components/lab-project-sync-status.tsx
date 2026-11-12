'use client';
import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
const stamp=(v:string)=>new Date(v).toLocaleString('en-US',{timeZone:'America/Chicago'})+' Central';
export function LabProjectSyncStatus(){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[hidden,setHidden]=useState(false);
 async function load(){
  const response=await adaFetch('/api/lab-project-sync');if(response.status===403){setHidden(true);return;}
  const body=await response.json();if(!response.ok)throw Error(body.error||'Sync history could not load.');setData(body);
 }
 useEffect(()=>{let active=true;adaFetch('/api/lab-project-sync').then(async response=>{if(!active)return;if(response.status===403){setHidden(true);return;}const body=await response.json();if(!response.ok)throw Error(body.error||'Sync history could not load.');if(active)setData(body);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Sync history could not load.');});return()=>{active=false;};},[]);
 async function run(action:'preview'|'apply'){
  setBusy(true);setError('');try{const response=await adaFetch('/api/lab-project-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});const body=await response.json();if(!response.ok)throw Error(body.error||'Sync did not complete.');await load();if(body.skipped)setError('A sync is already running or today’s scheduled run is complete.');else if(action==='apply'&&!body.failed)window.dispatchEvent(new Event('lab-project-sync-complete'));}catch(e){setError(e instanceof Error?e.message:'Sync did not complete.');}finally{setBusy(false);}
 }
 if(hidden)return null;
 return <details className="my-4 rounded border p-4"><summary className="cursor-pointer font-semibold">Project sync · {data?.enabled?'Scheduled daily at 6 a.m. Central':'Daily schedule not enabled'}</summary>
  <div className="mt-3 space-y-3 text-sm"><p>New Closed Won Active quotes and existing linked projects. Quotes keep their approved budgets.</p>
   {data&&!data.configured&&<p role="status">Read-only source connection needs configuration before sync can run.</p>}
   {error&&<p role="alert">{error}</p>}
   <div className="flex flex-wrap gap-4"><button className="underline disabled:opacity-50" disabled={busy||!data?.configured} onClick={()=>run('preview')}>Preview sync</button><button className="underline disabled:opacity-50" disabled={busy||!data?.configured} onClick={()=>run('apply')}>Run sync now</button><button className="underline disabled:opacity-50" disabled={busy} onClick={()=>load().catch(()=>setError('Sync history could not load.'))}>Refresh run log</button></div>
   {busy&&<p role="status">Sync is running. This can take several minutes.</p>}
   {data?.runs?.length?<><ul>{data.runs.map((r:any)=><li key={r.id}>{stamp(r.started_at)} · {r.mode} · {r.status}{r.error_code?' · '+r.error_code.replaceAll('_',' ').toLowerCase():''}</li>)}</ul>
    <p className="font-semibold">Latest run outcomes</p><ul className="space-y-2">{data.results.map((r:any)=><li key={r.scope_id}>{r.details?.title||r.projects?.name||'Quote awaiting verified link'}{(r.projects?.job_number||r.details?.jobNumber)?` · Job ${r.projects?.job_number||r.details.jobNumber}`:''} · {r.outcome} · {r.code.replaceAll('_',' ').toLowerCase()}{r.missing_hours>0?` · ${r.missing_hours} hours still need approved rates`:''}{r.details?.timeRecords!=null&&<span className="block">Job {r.details.jobNumber} · {r.details.timeRecords} time records · {r.details.hours} hours · approved labor ${r.details.knownCost} · {r.details.missingHours} unresolved hours</span>}</li>)}</ul></>:<p>No sync runs recorded yet.</p>}
  </div>
 </details>;
}
