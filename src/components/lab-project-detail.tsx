'use client';
import {ProjectPerDiemRecipients} from '@/components/project-per-diem-recipients';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adaFetch } from '@/lib/ada-client';
import { PageShell } from '@/components/ui/page-shell';
import { Card } from '@/components/ui/card';
import { PM_NAMES } from '@/lib/types';
type Line = { id:string; name:string; type:string; finalPrice:number; hoursAllowed:number; materialsBudget:number; laborBudget:number; buildBudget:number };
type Quote = { id:string; title:string; status:string; total:number|null; url:string|null; pdf:string|null };
type Payload = {
 project: { id:string; name:string; client:string|null; job_number:string|null; pm:string|null; close_date:string|null; due_date:string|null; status:string; hubspot_deal_url:string|null; qbo_project_url:string|null; monday_board_url:string|null };
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
 return <PageShell>
  <Link className="text-sm underline" href="/projects">All projects</Link>
  <div className="space-y-2"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{p.name}</h1><span className="rounded bg-emerald-100 px-2 py-1 text-sm text-emerald-950">{p.status}</span></div>
   <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><span>Job #{p.job_number||'Pending'}</span><span>Client: {p.client||'Pending'}</span><span>PM: {s.hubspot.accountManager||(p.pm&&(PM_NAMES[p.pm]||p.pm))||'Pending'}</span><span>Closed: {p.close_date||'Pending'}</span></div>
   <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={`/quotes/${source.workspace_id}`}>Open Lab quote</Link><Link className="underline" href={`/capacity/${source.workspace_id}`}>Capacity &amp; schedule</Link><External href={p.hubspot_deal_url}>HubSpot deal</External><External href={p.qbo_project_url}>QuickBooks project</External><External href={p.monday_board_url}>Monday board</External></div>
  </div>
  {s.warnings.length>0&&<div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Information to review</p><ul className="list-disc pl-5">{s.warnings.map(w=><li key={w}>{w}</li>)}</ul></div>}
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Lab quote total',money(s.totals.price)],['Build budget',money(s.totals.buildBudget)],['Quoted hours — all work',number(s.totals.hoursAllowed)],['HubSpot deal amount',money(s.hubspot.amount)]].map(([label,value])=><Card key={label} className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></Card>)}</div>
  <div aria-label="Project details" className="flex gap-5 overflow-x-auto border-b">{[['overview','Overview'],['quote','Quote & budget'],['hubspot','HubSpot quotes'],['documents','Documents']].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)} className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm ${tab===key?'border-foreground font-semibold':'border-transparent'}`}>{label}</button>)}</div>
  {tab==='overview'&&<div className="grid gap-4 lg:grid-cols-2"><Card className="space-y-3 p-4"><h2 className="font-semibold">Project dates</h2>{[['HubSpot due date',p.due_date],['Quote due date',s.schedule.dueDate],['Build start',s.schedule.buildStart],['Build finish',s.schedule.buildFinish],['Ship date',s.schedule.shipDate],['Install date',s.schedule.installDate],['Dismantle date',s.schedule.dismantleDate]].map(([label,value])=><div key={label} className="flex justify-between gap-4 text-sm"><span>{label}</span><span>{value||'Pending'}</span></div>)}</Card><Card className="space-y-3 p-4"><h2 className="font-semibold">Quote foundation</h2><p>{s.title}</p><p className="text-sm">Saved revision {source.workbook_revision}. Budgets retain this starting quote revision; subsequent quote edits require review.</p><p className="text-sm">Quote scheduling status: {s.sourceProjectStatus}.</p><p className="text-sm text-muted-foreground">Actual expenses and labor have not been imported. These figures are quote budgets, not costs incurred.</p></Card></div>}
  {tab==='quote'&&<Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b">{['Quote item','Type','Sell','Hours','Materials / other','Labor budget','Build budget'].map(h=><th key={h} className="p-3 text-left whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{s.lines.map(l=><tr key={l.id} className="border-b"><td className="p-3 min-w-48">{l.name}</td><td className="p-3">{l.type}</td><td className="p-3 whitespace-nowrap">{money(l.finalPrice)}</td><td className="p-3">{number(l.hoursAllowed)}</td><td className="p-3">{money(l.materialsBudget)}</td><td className="p-3">{money(l.laborBudget)}</td><td className="p-3">{money(l.buildBudget)}</td></tr>)}</tbody><tfoot><tr className="font-semibold"><td className="p-3" colSpan={2}>Total</td><td className="p-3">{money(s.totals.price)}</td><td className="p-3">{number(s.totals.hoursAllowed)}</td><td className="p-3">{money(s.totals.materialsBudget)}</td><td className="p-3">{money(s.totals.laborBudget)}</td><td className="p-3">{money(s.totals.buildBudget)}</td></tr></tfoot></table></Card>}
  {tab==='documents'&&<section className="space-y-4"><ProjectPerDiemRecipients key={projectId} projectId={projectId} onBlocked={setRecipientBlocked}/><p className="text-sm text-muted-foreground">Documents use this project's saved quote revision {source.workbook_revision}. Later quote edits do not silently change the project baseline.</p><div className="grid gap-4 md:grid-cols-3">{[['per-diem','Per Diem Summary','Quoted travel, install, off and dismantle days, daily per diem, and lead road bonus.'],['cad','CAD Turnover','Quoted CAD goal, fabrication instructions and material requirements.'],['bom','BOM','Combined material quantities plus a breakdown for each item.']].map(([kind,title,description])=><Card className="space-y-3 p-4" key={kind}><h2 className="font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p><button className="rounded-md border px-3 py-2 text-sm" disabled={!!documentBusy||(kind==='per-diem'&&recipientBlocked)} onClick={()=>void downloadDocument(kind)}>{documentBusy===kind?'Preparing…':`Download ${title}`}</button></Card>)}</div>{documentError&&<p role="alert">{documentError}</p>}</section>}
  {tab==='hubspot'&&<Card className="space-y-4 p-4"><h2 className="font-semibold">Associated HubSpot quotes</h2><p className="text-sm text-muted-foreground">HubSpot reported totals can include tax. They remain separate from the Lab quote total.</p>{s.hubspot.quotes.length?s.hubspot.quotes.map(q=><div key={q.id} className="space-y-1 border-t pt-3"><p className="font-medium">{q.title}{q.id===s.hubspot.selectedQuoteId?' · Production reference':''}</p><p className="text-sm">{q.status} · {money(q.total)}</p><div className="flex gap-4 text-sm"><External href={q.url}>View quote</External><External href={q.pdf}>Download PDF</External></div></div>):<p className="text-sm">HubSpot quote association pending confirmation.</p>}</Card>}
 </PageShell>;
}
