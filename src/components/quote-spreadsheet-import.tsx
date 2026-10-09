'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {adaFetch} from '@/lib/ada-client';
import {importV27Workbook,reviewV27Workbook,repairV27Workbook,emptyImportRepair} from '@/lib/quote-spreadsheet-import';
import type {WorkBook} from 'xlsx';
import {EMPTY_SCHEDULE,FORECAST_STATUSES,parseSchedule,type QuoteSchedule} from '@/lib/quote-schedule';
import {parseQuoteV27} from '@/lib/quote-v27-validation';

type Preview=ReturnType<typeof importV27Workbook>;
async function responseBody(response:Response){const body=await response.json();if(!response.ok)throw new Error(body.error||'Request failed.');return body;}

export function QuoteSpreadsheetImport(){
 const [preview,setPreview]=useState<Preview|null>(null),[title,setTitle]=useState(''),[client,setClient]=useState('');
 const [schedule,setSchedule]=useState<QuoteSchedule>({...EMPTY_SCHEDULE}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(''),[workspaceId,setWorkspaceId]=useState(''),[uncertain,setUncertain]=useState(false);
 const guard=useRef(false);
 const [source,setSource]=useState<{book:WorkBook;hash:string}|null>(null),[review,setReview]=useState<ReturnType<typeof reviewV27Workbook>|null>(null),[repairs,setRepairs]=useState(emptyImportRepair);
 function check(book:WorkBook,hash:string,corrections=emptyImportRepair()){
  setPreview(null);setError('');
  try{const repaired=repairV27Workbook(book,corrections);setPreview(importV27Workbook(repaired.book,hash,repaired.notes));}
  catch(cause){setError(cause instanceof Error?cause.message:'Spreadsheet could not be checked.');}
 }
 async function read(file:File|undefined){
  if(!file||guard.current)return;guard.current=true;setBusy(true);setError('');setPreview(null);setSaved('');
  setSource(null);setReview(null);setRepairs(emptyImportRepair());
  try{
   if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>10_000_000)throw new Error('Choose an .xlsx export under 10 MB.');
   const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   const XLSX=await import('xlsx');
   const book=XLSX.read(bytes,{type:'array',cellFormula:true,cellHTML:false,cellStyles:false,bookVBA:false}),issues=reviewV27Workbook(book);
   setSource({book,hash});setReview(issues);setTitle(file.name.replace(/\.xlsx$/i,''));setSchedule({...EMPTY_SCHEDULE});
   if(!issues.missingSettings.length&&!issues.unmatched.length)check(book,hash);
  }catch(cause){setError(cause instanceof Error?cause.message:'Spreadsheet could not be read.');}finally{guard.current=false;setBusy(false);}
 }
 async function save(){
  if(!preview||guard.current)return;guard.current=true;setBusy(true);setError('');
  try{
   if(!title.trim())throw new Error('Enter a quote name.');
   const checked=parseSchedule(schedule);
   if(!checked.buildStart||!checked.buildFinish||!checked.status||(preview.demand.field>0&&!checked.installDate))throw new Error('Choose build dates, forecast status, and an install date for field labor so Capacity can schedule this quote.');
   const document=parseQuoteV27({...preview.document,schedule:checked});
   if(new TextEncoder().encode(JSON.stringify({document,expectedVersion:0})).length>1_900_000)throw new Error('Workbook exceeds the save size limit.');
   let id=workspaceId;
   if(!id){
    // Include archived workspaces and all pages; never overwrite an existing quote.
    for(const status of ['', 'archived'])for(let offset=0;;offset+=100){
     const page=await responseBody(await adaFetch(`/api/quote-workspaces?offset=${offset}&status=${status}`));
     for(const workspace of page.workspaces??[]){
      const existing=await responseBody(await adaFetch(`/api/quote-workspaces/${workspace.id}/workbook`));
      if(existing.document?.assumptionsVersion===document.assumptionsVersion)throw new Error(`This file is already imported as “${workspace.title}”. Open that quote instead of importing it again.`);
      if(workspace.title.trim().toLowerCase()===title.trim().toLowerCase())throw new Error(`A quote named “${workspace.title}” already exists. Check it before creating another, or use a distinct quote name.`);
     }
     if(!page.hasMore)break;
    }
    // If creation has an unknown outcome, don't retry and risk an extra workspace.
    setUncertain(true);
    const created=await responseBody(await adaFetch('/api/quote-workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.trim(),clientName:client.trim()||null})}));
    if(!created.workspace?.id)throw new Error('Quote creation was not confirmed. Check Quotes before trying again.');
    id=created.workspace.id;setWorkspaceId(id);setUncertain(false);
   }
   const current=await responseBody(await adaFetch(`/api/quote-workspaces/${id}/workbook`));
   if(current.document){
    if(JSON.stringify(current.document)!==JSON.stringify(document))throw new Error('This workspace already has a saved revision. Open it to review; import will not overwrite it.');
   }else await responseBody(await adaFetch(`/api/quote-workspaces/${id}/workbook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document,expectedVersion:0})}));
   const verified=await responseBody(await adaFetch(`/api/quote-workspaces/${id}/workbook`));
   if(JSON.stringify(verified.document)!==JSON.stringify(document))throw new Error('Save could not be verified. Open the quote before continuing.');
   setSaved(id);
  }catch(cause){setError(cause instanceof Error?cause.message:'Import could not complete.');}finally{guard.current=false;setBusy(false);}
 }
 const inputClass='block mt-1 rounded border px-2 py-1.5 w-full bg-background';
 return <section className="rounded-xl border bg-background p-5 space-y-4" aria-label="Import spreadsheet quote">
  <h2 className="text-lg font-semibold">Import spreadsheet quote</h2>
  <p className="text-sm text-muted-foreground">In Google Sheets, choose File → Download → Microsoft Excel (.xlsx). Upload the complete v27 or supported v21 workbook. Review one quote at a time; saving adds its dates and labor demand to Capacity.</p>
  <label className="block text-sm">Spreadsheet file<input className={inputClass} type="file" accept=".xlsx" disabled={busy||!!workspaceId||uncertain} onChange={event=>{const file=event.target.files?.[0];event.target.value="";void read(file);}}/></label>
  {error?<p role="alert" className="text-sm text-red-700">{error}</p>:null}
  {uncertain&&!busy?<p role="alert">Creation may have completed. <Link className="underline" href="/quotes">Check Quotes</Link> before starting another import.</p>:null}
  {source&&review&&(review.missingSettings.length>0||review.unmatched.length>0)?<fieldset disabled={busy||!!workspaceId||uncertain} className="rounded border bg-amber-50 text-slate-900 p-3 space-y-3">
   <legend className="font-semibold">Review spreadsheet corrections</legend>
   <p className="text-sm">Your uploaded data is retained on this page. Fill in the missing details below, then check again. Corrections affect this import only and are recorded with the quote. Prices, budgets and hours must still match the spreadsheet before saving.</p>
   {review.missingSettings.map(issue=><label className="block text-sm" key={issue.cell}>{issue.label} (Settings!{issue.cell})<input className={inputClass} type="number" min="0" step="any" value={repairs.settings[issue.cell]??''} onChange={e=>{const value=e.target.value;setPreview(null);setRepairs(p=>({...p,settings:{...p.settings,[issue.cell]:value}}));}}/></label>)}
   {review.unmatched.map(issue=><div key={issue.row} className="border-t pt-2 text-sm space-y-2">
    <p className="font-medium">Takeoffs row {issue.row} · {issue.name||'No item name'} · {issue.description||'Missing Materials & Labor description'}</p>
    {issue.needsItem?<label className="block">Quote item for row {issue.row}<select className={inputClass} value={repairs.items[issue.row]??''} onChange={e=>{const value=e.target.value;setPreview(null);setRepairs(p=>({...p,items:{...p.items,[issue.row]:value}}));}}><option value="">Choose the matching quote item</option>{review.choices.map(name=><option key={name}>{name}</option>)}</select></label>:null}
    {issue.needsDescription?<label className="block">Materials & Labor for row {issue.row}<input className={inputClass} value={repairs.descriptions[issue.row]??''} onChange={e=>{const value=e.target.value;setPreview(null);setRepairs(p=>({...p,descriptions:{...p.descriptions,[issue.row]:value}}));}}/></label>:null}
   </div>)}
   <button className="rounded border bg-white px-3 py-2" onClick={()=>check(source.book,source.hash,repairs)}>Check corrected import</button>
  </fieldset>:null}
  {preview?<>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
    <label>Quote name<input className={inputClass} value={title} disabled={busy||!!workspaceId} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Client (optional)<input className={inputClass} value={client} disabled={busy||!!workspaceId} onChange={e=>setClient(e.target.value)}/></label>
    {(['buildStart','buildFinish','installDate'] as const).map(key=><label key={key}>{({buildStart:'Build start',buildFinish:'Build finish',installDate:'Install date'})[key]}<input className={inputClass} type="date" defaultValue={schedule[key]} disabled={busy||!!workspaceId} onBlur={e=>{const value=e.target.value;setSchedule(previous=>({...previous,[key]:value}));}}/></label>)}
    <label>Forecast status<select className={inputClass} value={schedule.status} disabled={busy||!!workspaceId} onChange={e=>setSchedule(previous=>({...previous,status:e.target.value as QuoteSchedule['status']}))}><option value="">Choose status</option>{FORECAST_STATUSES.map(status=><option key={status}>{status}</option>)}</select></label>
   </div>
   <div className="rounded border bg-sky-50 p-3 text-sm text-slate-900"><p>{preview.document.lines.length} quote lines · {preview.document.takeoffs.length} takeoff rows · Quote total {preview.demand.price.toLocaleString('en-US',{style:'currency',currency:'USD'})}</p><p>Shop: {preview.demand.shop} hrs · Field: {preview.demand.field} hrs · Design: {preview.demand.design} hrs</p><ul>{Object.entries(preview.demand.trades).map(([trade,hours])=><li key={trade}>{trade}: {hours} hrs</li>)}</ul></div>
   <ul className="text-sm text-muted-foreground list-disc pl-5">{preview.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>
   {saved?<p role="status">Saved and reopened successfully. <Link className="underline" href={`/quotes/${saved}`}>Open quote</Link> · <Link className="underline" href="/capacity">View Capacity</Link> · <button className="underline" onClick={()=>{setPreview(null);setSource(null);setReview(null);setSaved('');setWorkspaceId('');setClient('');}}>Import another quote</button></p>:<button className="rounded bg-primary text-primary-foreground px-4 py-2" disabled={busy||uncertain} onClick={()=>void save()}>{busy?'Working…':workspaceId?'Retry saving this quote':'Import quote and add to Capacity'}</button>}
   {workspaceId&&!saved?<p className="text-sm">Workspace created. <Link className="underline" href={`/quotes/${workspaceId}`}>Open quote</Link>. Retry saves into this same workspace.</p>:null}
  </>:null}
 </section>;
}
