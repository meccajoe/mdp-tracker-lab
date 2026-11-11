'use client';
import { LabProjectActivityProvider } from '@/components/lab-project-activity-provider';
import { LabProjectOverview } from '@/components/lab-project-overview';
import { LabProjectActivity } from '@/components/lab-project-activity';
import {ProjectPerDiemRecipients} from '@/components/project-per-diem-recipients';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adaFetch } from '@/lib/ada-client';
import { invalidateQuoteLibrary } from '@/lib/quote-library-client';
import { PageShell } from '@/components/ui/page-shell';
import { Card } from '@/components/ui/card';
import { PM_NAMES } from '@/lib/types';
type Line = { id:string; name:string; type:string; finalPrice:number; hoursAllowed:number; materialsBudget:number; laborBudget:number; buildBudget:number };
type Quote = { id:string; title:string; status:string; total:number|null; url:string|null; pdf:string|null };
export type Payload = {
 liveProjectStatus?:string;
 project: { notes?:string|null; id:string; name:string; client:string|null; job_number:string|null; pm:string|null; close_date:string|null; due_date:string|null; status:string; hubspot_deal_url:string|null; qbo_project_url:string|null; monday_board_url:string|null };
 source: { workspace_id:string; workbook_revision:number; imported_at:string; snapshot: {
  title:string; warnings:string[]; schedule:Record<string,string>; sourceProjectStatus:string;
  totals:{ price:number; buildBudget:number; hoursAllowed:number; materialsBudget:number; laborBudget:number };
  lines:Line[]; hubspot:{ amount:number|null; accountManager:string|null; quotes:Quote[]; selectedQuoteId:string|null };
 } };
};
const money=(v:number|null|undefined)=>v==null?'Pending':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
const number=(v:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
function External({href,children}:{href:string|null;children:React.ReactNode}){
 return href&&/^https:\/\//i.test(href)?<a className="underline" href={href} target="_blank" rel="noreferrer">{children}</a>:null;
}
export function LabProjectDetail({projectId}:{projectId:string}){
 const [recipientBlocked,setRecipientBlocked]=useState(true);
 const [identityBusy,setIdentityBusy]=useState(false),[identityError,setIdentityError]=useState('');
 async function refreshHubSpot(){setIdentityBusy(true);setIdentityError('');try{const r=await adaFetch(`/api/projects/${encodeURIComponent(projectId)}/refresh-hubspot`,{method:'POST'});const body=await r.json();if(!r.ok)throw Error(body.error||'HubSpot refresh failed.');invalidateQuoteLibrary();setAttempt(v=>v+1);}catch(e){setIdentityError(e instanceof Error?e.message:'HubSpot refresh failed.');}finally{setIdentityBusy(false);}}

 const [documentBusy,setDocumentBusy]=useState(''),[documentError,setDocumentError]=useState('');
 async function downloadDocument(kind:string){setDocumentBusy(kind);setDocumentError('');try{const r=await adaFetch(`/api/projects/${encodeURIComponent(projectId)}/documents?kind=${kind}`);if(!r.ok){const b=await r.json();throw Error(b.error||'Document unavailable.');}const url=URL.createObjectURL(await r.blob()),link=document.createElement('a');link.href=url;link.download=r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]??`${kind}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){setDocumentError(e instanceof Error?e.message:'Document unavailable.');}finally{setDocumentBusy('');}}
 const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(''),[tab,setTab]=useState('overview'),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let current=true;setData(null);setError('');
  adaFetch(`/api/projects/${encodeURIComponent(projectId)}/lab-source`).then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error||'Project could not load.');if(current)setData(body);}).catch(e=>{if(current)setError(e instanceof Error?e.message:'Project could not load.');});
  return()=>{current=false;};
 },[projectId,attempt]);
 if(error)return <PageShell><p role="alert">{error}</p><button className="underline" onClick={()=>setAttempt(v=>v+1)}>Retry</button><Link href="/projects">Back to projects</Link></PageShell>;
 if(!data)return <PageShell><p>Loading project…</p></PageShell>;
 const {project:p,source}=data,s=source.snapshot;
 return <LabProjectActivityProvider key={projectId} projectId={projectId}><PageShell className="pm-project-page pm-readable-financials lab-project-content">
  <div className="pm-breadcrumb"><Link href="/projects">Projects</Link><span>/</span><span>{p.job_number||p.name}</span></div>
  <header className="space-y-4"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{p.name}</h1><span className="rounded bg-emerald-100 px-2 py-1 text-sm text-emerald-950">{p.status}</span></div>
   <div className="pm-project-meta flex flex-wrap gap-x-5 gap-y-2 text-sm"><span>Job #{p.job_number||'Pending'}</span><span>Client: {p.client||'Pending'}</span><span>PM: {s.hubspot.accountManager||(p.pm&&(PM_NAMES[p.pm]||p.pm))||'Pending'}</span><span>Closed: {p.close_date||'Pending'}</span></div>
   <div className="lab-project-links flex flex-wrap gap-4 text-sm"><Link className="underline" href={`/quotes/${source.workspace_id}`}>Open Lab quote</Link><Link className="underline" href={`/capacity/${source.workspace_id}`}>Capacity &amp; schedule</Link><External href={p.hubspot_deal_url}>HubSpot deal</External><button className="underline disabled:opacity-50" disabled={identityBusy} onClick={()=>void refreshHubSpot()}>{identityBusy?'Refreshing…':'Refresh from HubSpot'}</button><External href={p.qbo_project_url}>QuickBooks project</External><External href={p.monday_board_url}>Monday board</External></div>
  </header>
  {identityError&&<p role="alert" className="text-sm text-red-700">{identityError}</p>}
  {tab!=='overview'&&s.warnings.length>0&&<div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Information to review</p><ul className="list-disc pl-5">{s.warnings.map(w=><li key={w}>{w}</li>)}</ul></div>}
  <p className="pm-table-subtitle">Lab quote {money(s.totals.price)} · HubSpot deal {money(s.hubspot.amount)} · Budget revision {source.workbook_revision}</p>
  <div aria-label="Project details" className="pm-project-tabs flex flex-wrap gap-1 border-b">{[['overview','Overview'],['budget','Budget Detail'],['quote','Quote Allocation'],['activity','Activity'],['hubspot','HubSpot quotes'],['documents','Documents']].map(([key,label])=><button data-slot="tabs-trigger" data-active={(key==='activity'?tab==='expenses'||tab==='labor':tab===key)||undefined} key={key} aria-pressed={key==='activity'?tab==='expenses'||tab==='labor':tab===key} onClick={()=>setTab(key==='activity'?'expenses':key)} className="border-b-2 border-transparent px-4 py-3 text-sm">{label}</button>)}</div>
  {(tab==='expenses'||tab==='labor')&&<div className="pm-allocation-switch" role="group" aria-label="Activity type">{[['expenses','Expenses'],['labor','Labor']].map(([key,label])=><button key={key} aria-pressed={tab===key} className={tab===key?'pm-primary-action':'pm-text-action'} onClick={()=>setTab(key)}>{label}</button>)}</div>}
  {tab==='overview'&&<LabProjectOverview data={data} onNavigate={setTab}/>}
  {(tab==='budget'||tab==='expenses'||tab==='labor')&&<LabProjectActivity projectId={projectId} view={tab} budget={s.totals} lines={s.lines} revision={source.workbook_revision}/>}
  {tab==='quote'&&<Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b">{['Quote item','Type','Sell','Hours','Materials / other','Labor budget','Build budget'].map(h=><th key={h} className="p-3 text-left whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{s.lines.map(l=><tr key={l.id} className="border-b"><td data-label="Quote item" className="p-3 min-w-48">{l.name}</td><td data-label="Type" className="p-3">{l.type}</td><td data-label="Sell" className="p-3 whitespace-nowrap">{money(l.finalPrice)}</td><td data-label="Hours" className="p-3">{number(l.hoursAllowed)}</td><td data-label="Materials / other" className="p-3">{money(l.materialsBudget)}</td><td data-label="Labor budget" className="p-3">{money(l.laborBudget)}</td><td data-label="Build budget" className="p-3">{money(l.buildBudget)}</td></tr>)}</tbody><tfoot><tr className="font-semibold"><td className="p-3" colSpan={2}>Total</td><td className="p-3">{money(s.totals.price)}</td><td className="p-3">{number(s.totals.hoursAllowed)}</td><td className="p-3">{money(s.totals.materialsBudget)}</td><td className="p-3">{money(s.totals.laborBudget)}</td><td className="p-3">{money(s.totals.buildBudget)}</td></tr></tfoot></table></Card>}
  {tab==='documents'&&<section className="space-y-4"><ProjectPerDiemRecipients key={projectId} projectId={projectId} onBlocked={setRecipientBlocked}/><p className="text-sm text-muted-foreground">Documents use this project's saved quote revision {source.workbook_revision}. Later quote edits do not silently change the project baseline.</p><div className="grid gap-4 md:grid-cols-3">{[['per-diem','Per Diem Summary','Quoted travel, install, off and dismantle days, daily per diem, and lead road bonus.'],['cad','CAD Turnover','Quoted CAD goal, fabrication instructions and material requirements.'],['bom','BOM','Combined material quantities plus a breakdown for each item.']].map(([kind,title,description])=><Card className="space-y-3 p-4" key={kind}><h2 className="font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p><button className="rounded-md border px-3 py-2 text-sm" disabled={!!documentBusy||(kind==='per-diem'&&recipientBlocked)} onClick={()=>void downloadDocument(kind)}>{documentBusy===kind?'Preparing…':`Download ${title}`}</button></Card>)}</div>{documentError&&<p role="alert">{documentError}</p>}</section>}
  {tab==='hubspot'&&<Card className="space-y-4 p-4"><h2 className="font-semibold">Associated HubSpot quotes</h2><p className="text-sm text-muted-foreground">HubSpot reported totals can include tax. They remain separate from the Lab quote total.</p>{s.hubspot.quotes.length?s.hubspot.quotes.map(q=><div key={q.id} className="space-y-1 border-t pt-3"><p className="font-medium">{q.title}{q.id===s.hubspot.selectedQuoteId?' · Production reference':''}</p><p className="text-sm">{q.status} · {money(q.total)}</p><div className="flex gap-4 text-sm"><External href={q.url}>View quote</External><External href={q.pdf}>Download PDF</External></div></div>):<p className="text-sm">HubSpot quote association pending confirmation.</p>}</Card>}
 </PageShell></LabProjectActivityProvider>;
}
