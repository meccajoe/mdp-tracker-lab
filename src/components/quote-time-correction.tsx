'use client';
import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {quoteTimeLabel} from '@/lib/quote-time';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription} from './ui/alert-dialog';
type Snapshot={totalMs:number;version:number;canCorrect:boolean;actorId:string;history:{version:number;corrected_at:string;previous_ms:number;total_ms:number;reason:string;actor:string}[]};
export function QuoteTimeCorrection({workspaceId}:{workspaceId:string}){
 const [open,setOpen]=useState(false);
 return <><button type="button" className="ml-2 underline" onClick={()=>setOpen(true)} aria-label="Edit quote time">Edit Time</button>{open&&<CorrectionDialog key={workspaceId} workspaceId={workspaceId} close={()=>setOpen(false)}/>}</>;
}
function CorrectionDialog({workspaceId,close}:{workspaceId:string;close:()=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[hours,setHours]=useState(''),[minutes,setMinutes]=useState(''),[reason,setReason]=useState('Accidental timer overcount'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const endpoint=`/api/quote-workspaces/${workspaceId}/time/correction`;
 useEffect(()=>{let active=true;void adaFetch(endpoint).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(active){setSnapshot(data);setHours(String(Math.floor(data.totalMs/3600000)));setMinutes(String(Math.floor(data.totalMs/60000)%60));}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[endpoint]);
 async function save(){if(!snapshot||busy)return;const h=Number(hours),m=Number(minutes);if(!/^\d+$/.test(hours)||!/^\d+$/.test(minutes)||m>59||h>100000||!reason.trim()){setError('Enter whole hours and minutes (0–59), and a reason.');return;}setBusy(true);setError('');try{
  const r=await adaFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Quote-Time-Actor':snapshot.actorId},body:JSON.stringify({totalMs:(h*60+m)*60000,version:snapshot.version,reason})}),data=await r.json();if(!r.ok)throw Error(data.error);
  window.dispatchEvent(new Event('quote-time-corrected'));window.dispatchEvent(new Event('quote-workbook-saved'));close();
 }catch(e){setError(e instanceof Error?e.message:'Could not correct time.');}finally{setBusy(false);}}
 return <AlertDialog open onOpenChange={value=>{if(!value&&!busy)close();}}><AlertDialogContent><AlertDialogTitle>Edit Time Spent</AlertDialogTitle><AlertDialogDescription>Set the corrected total time for this quote across the team. Your timer will pause after saving; click Resume when you start working again. Quote prices and revisions are unchanged.</AlertDialogDescription>
 {snapshot?<><p className="text-sm">Recorded total: <strong>{quoteTimeLabel(snapshot.totalMs)}</strong></p><form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-3"><div className="flex gap-3"><label>Hours<input className="block w-24 rounded border p-2" aria-label="Corrected hours" type="number" min="0" max="100000" step="1" required disabled={busy||!snapshot.canCorrect} value={hours} onChange={e=>setHours(e.target.value)}/></label><label>Minutes<input className="block w-24 rounded border p-2" aria-label="Corrected minutes" type="number" min="0" max="59" step="1" required disabled={busy||!snapshot.canCorrect} value={minutes} onChange={e=>setMinutes(e.target.value)}/></label></div><label className="block">Reason<input aria-label="Time correction reason" className="block w-full rounded border p-2" required maxLength={500} disabled={busy||!snapshot.canCorrect} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="rounded bg-foreground px-3 py-2 text-background" disabled={busy||!snapshot.canCorrect}>{busy?'Saving…':'Save corrected time'}</button></form>{!snapshot.canCorrect&&<p>Time editing is unavailable for this quote.</p>}
 {!!snapshot.history.length&&<details className="text-xs"><summary>Recent corrections</summary><ul className="max-h-40 overflow-auto">{snapshot.history.map(h=><li key={h.version} className="my-2">{new Date(h.corrected_at).toLocaleString()} · {h.actor}<br/>{quoteTimeLabel(h.previous_ms)} → {quoteTimeLabel(h.total_ms)} · {h.reason}</li>)}</ul></details>}</>:!error&&<p>Loading recorded time…</p>}
 {error&&<p role="alert" className="text-red-700">{error}</p>}<button type="button" className="rounded border px-3 py-2" disabled={busy} onClick={close}>Cancel</button></AlertDialogContent></AlertDialog>;
}
