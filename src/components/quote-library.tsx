'use client';
import {groupQuoteVersions} from '@/lib/quote-version-groups';
import {forecastLabel} from '@/lib/quote-schedule';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui/dropdown-menu';
import {QuoteCadDownload} from './quote-cad-download';
import {QuoteSectionNav} from './quote-section-nav';
import {QuoteColumnResize, RememberedColumns} from './quote-column-resize';
import {useRouter} from 'next/navigation';
import {SALES_FORECAST_STATUSES,PROJECT_STATUSES} from '@/lib/quote-schedule';
import {invalidateQuoteLibrary} from '@/lib/quote-library-client';
import {adaFetch} from '@/lib/ada-client';
import {changeQuoteArchives} from '@/lib/quote-bulk-archive';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {PageShell} from './ui/page-shell';
import {Card} from './ui/card';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from './ui/table';
type Workspace={capacity_group:string;capacity_selected:boolean;capacity_version:number;id:string;title:string;client_name:string|null;contact_name:string|null;status:string;quote_status:'draft'|'final';status_version:number;forecast_status:string;project_status:string;workbook_revision:number;created_at:string;last_modified:string;quote_total:number|null};
const date=(value:string)=>value?new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
async function result(response:Response){const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Request failed.');return payload;}
export function QuoteLibrary({archived=false}:{archived?:boolean}){
 const router=useRouter();
 const [rows,setRows]=useState<Workspace[]>([]),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[loading,setLoading]=useState(true),[ready,setReady]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set());
 const [dialog,setDialog]=useState<'create'|'rename'|'clone'|'group'|null>(null),[target,setTarget]=useState<Workspace|null>(null);
 const [pendingArchive,setPendingArchive]=useState<string[]|null>(null);
 const requestId=useRef(''),guard=useRef(false),loadGeneration=useRef(0);
 const load=useCallback(async()=>{
  const generation=++loadGeneration.current;setLoading(true);
  try{const all:Workspace[]=[];let management=false;for(let offset=0;;offset+=100){const p=await result(await adaFetch(`/api/quote-workspaces?offset=${offset}${archived?'&status=archived':''}`));all.push(...p.workspaces);management=Boolean(p.managementReady);if(!p.hasMore)break;}if(generation===loadGeneration.current){setRows(all);setReady(management);}}
  catch(e){if(generation===loadGeneration.current)setError(e instanceof Error?e.message:'Quotes could not load.');}
  finally{if(generation===loadGeneration.current)setLoading(false);}
 },[archived]);
 useEffect(()=>{void load();return()=>{loadGeneration.current++;};},[load]);
 const [sort,setSort]=useState<{key:keyof Workspace|'cad';direction:number}>({key:'last_modified',direction:-1});
 const [expandedGroups,setExpandedGroups]=useState<Set<string>>(new Set());
 const matching=(w:Workspace)=>(status==='all'||w.quote_status===status)&&`${w.title} ${w.client_name??''} ${w.contact_name??''}`.toLowerCase().includes(query.toLowerCase().trim());
 const compare=(a:Workspace,b:Workspace)=>sort.key==='quote_total'?sort.direction*(a.quote_total===b.quote_total?0:a.quote_total==null?-1:b.quote_total==null?1:a.quote_total-b.quote_total):sort.direction*String(a[sort.key==='cad'?'quote_status':sort.key]??'').localeCompare(String(b[sort.key==='cad'?'quote_status':sort.key]??''),undefined,{numeric:true,sensitivity:'base'});
 const groups=groupQuoteVersions(rows,matching,compare);
 const filtered=Boolean(query.trim())||status!=='all';
 const displayRows=groups.flatMap(group=>{
  const expanded=filtered||expandedGroups.has(group.id);
  return [{w:group.primary,group,child:false,expanded},...(expanded?group.others.map(w=>({w,group,child:true,expanded})):[])];
 });
 const visible=displayRows.map(row=>row.w);
 function toggleGroup(id:string){setExpandedGroups(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});}

 function open(kind:'create'|'rename'|'clone'|'group',workspace:Workspace|null=null){setDialog(kind);setTarget(workspace);setError('');requestId.current=crypto.randomUUID();}
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(guard.current)return;guard.current=true;setBusy(true);setError('');const form=new FormData(e.currentTarget);
  try{
   if(dialog==='group'){await result(await adaFetch(`/api/quote-workspaces/${target!.id}/capacity-version`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:form.get('targetId')==='separate'?'separate':'join',targetId:form.get('targetId')==='separate'?null:form.get('targetId'),expectedVersion:target!.capacity_version})}));invalidateQuoteLibrary();setDialog(null);await load();return;}
   const payload=dialog==='rename'?{title:String(form.get('title')).trim(),renameOnly:true}:dialog==='clone'?{title:String(form.get('title')).trim(),clientName:String(form.get('clientName')).trim(),requestId:requestId.current,copySchedule:form.get('copySchedule')==='on',sameProject:form.get('sameProject')==='yes'}:{title:String(form.get('title')).trim(),clientName:String(form.get('clientName')).trim(),contactName:String(form.get('contactName')??'').trim(),requestId:requestId.current};
   const p=await result(await adaFetch(dialog==='create'?'/api/quote-workspaces':`/api/quote-workspaces/${target!.id}${dialog==='clone'?'/clone':''}`,{method:dialog==='rename'?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));
   setDialog(null);if(dialog==='rename')await load();else router.push(`/quotes/${p.workspace.id}`);
  }catch(e){setError(e instanceof Error?e.message:'Quote could not be saved.');}finally{setBusy(false);guard.current=false;}
 }
 async function lifecycle(ids:string[],restore=false,confirmed=false){if(guard.current||!ids.length)return;if(!restore&&!confirmed){setPendingArchive(ids);return;}setPendingArchive(null);guard.current=true;setBusy(true);setError('');const outcome=await changeQuoteArchives(ids,restore,adaFetch),count=outcome.succeeded.length,failed=outcome.failed;
  if(outcome.errors.length)setError([...new Set(outcome.errors)].join(' '));
  setSelected(new Set(failed));setMessage(`${count} quote${count===1?'':'s'} ${restore?'restored':'archived'}.${failed.length?` ${failed.length} could not be changed and remain selected.`:''}`);await load();guard.current=false;setBusy(false);
 }
 async function changeStatus(w:Workspace,next:string){
  if(guard.current)return;guard.current=true;loadGeneration.current++;setBusy(true);setError('');setMessage('Saving quote status…');
  setRows(rows=>rows.map(row=>row.id===w.id?{...row,quote_status:next as Workspace['quote_status']}:row));
  try{const p=await result(await adaFetch(`/api/quote-workspaces/${w.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next,expectedVersion:w.status_version,expectedRevision:w.workbook_revision})}));
   setRows(rows=>rows.map(row=>row.id===w.id?{...row,quote_status:p.status,status_version:p.version,last_modified:new Date().toISOString()}:row));invalidateQuoteLibrary();setMessage('Quote status saved.');
  }catch(e){setRows(rows=>rows.map(row=>row.id===w.id?w:row));setMessage('');setError(e instanceof Error?e.message:'Status could not change.');await load();}finally{guard.current=false;setBusy(false);setLoading(false);}
 }
 async function changeForecast(w:Workspace,status:string,project=false){
  if(guard.current)return;guard.current=true;loadGeneration.current++;setBusy(true);setError('');setMessage('Saving status…');
  const updated={...w,...(project?{project_status:status}:{forecast_status:status,...(status==='Closed won'?{project_status:'Active'}:{})})};
  setRows(rows=>rows.map(row=>row.id===w.id?updated:row));
  try{const p=await result(await adaFetch(`/api/quote-workspaces/${w.id}/forecast`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(project?{projectStatus:status}:{status}),expectedVersion:w.workbook_revision})}));
   setRows(rows=>rows.map(row=>row.id===w.id?{...updated,workbook_revision:p.version,last_modified:new Date().toISOString()}:row));invalidateQuoteLibrary();if(!project&&status==='Closed won')await load();setMessage(p.warning||'Status saved. Capacity uses the updated status.');
  }catch(e){setRows(rows=>rows.map(row=>row.id===w.id?w:row));setMessage('');setError(e instanceof Error?e.message:'Forecast could not save.');await load();}finally{guard.current=false;setBusy(false);setLoading(false);}
 }
 async function useCapacity(w:Workspace){if(guard.current)return;guard.current=true;setBusy(true);setError('');try{await result(await adaFetch(`/api/quote-workspaces/${w.id}/capacity-version`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'select',expectedVersion:w.capacity_version})}));invalidateQuoteLibrary();await load();}catch(e){setError((e as Error).message);}finally{guard.current=false;setBusy(false);}}
 function toggle(id:string,checked:boolean){setSelected(previous=>{const next=new Set(previous);if(checked)next.add(id);else next.delete(id);return next;});}
 return <PageShell>
  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase text-muted-foreground">Estimating</p><h1 className="text-2xl font-bold">{archived?'Archived quotes':'Quotes'}</h1></div><div className="flex flex-wrap gap-3 items-center"><Link className="underline" href="/quotes/import">Import spreadsheet</Link><Button onClick={()=>open('create')}>New quote</Button></div></div>
  <QuoteSectionNav/>
  <div className="flex flex-wrap gap-3 items-center"><Input aria-label="Search quotes" placeholder="Search project or client" value={query} onChange={e=>setQuery(e.target.value)} className="max-w-md"/><label>Quote Status <select className="rounded border p-2" aria-label="Filter quote status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="final">Final</option></select></label><Button variant="outline" disabled={busy||!selected.size} onClick={()=>void lifecycle([...selected],archived)}>{archived?'Restore':'Archive'} selected ({selected.size})</Button></div>
  {error?<p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error} <button className="underline" onClick={()=>{setError('');void load();}}>Reload quotes</button></p>:null}{message?<p role="status">{message}</p>:null}
  {!loading&&!ready?<p className="text-sm text-amber-800">Global settings, cloning and Draft/Final controls need the lab database update. Existing quotes remain available.</p>:null}
  {pendingArchive?<div role="alertdialog" aria-label="Archive selected quotes" className="rounded border bg-amber-50 p-4 text-slate-900"><p>Archive {pendingArchive.length} quote{pendingArchive.length===1?'':'s'}? You can restore them from Archived quotes.</p><ul className="my-2 list-disc pl-5">{pendingArchive.map(id=><li key={id}>{rows.find(w=>w.id===id)?.title}</li>)}</ul><Button disabled={busy} onClick={()=>void lifecycle(pendingArchive,false,true)}>Confirm archive</Button> <Button variant="outline" onClick={()=>setPendingArchive(null)}>Cancel archive</Button></div>:null}
  <Card className="overflow-x-auto"><Table style={{tableLayout:'fixed',minWidth:1000}}><RememberedColumns storageKey="quotes-list" labels={["Selection","Project name","Client name","Quote Total","Quote Status","Forecast Status","Project Status","Use for Capacity","Date created","Last modified","CAD Turnover","BOM","Budget Handoff"]} defaultWidths={[44,280,170,130,110,145,130,165,120,120,130,80,130]}/><TableHeader><TableRow>
   <TableHead><input type="checkbox" aria-label="Select all visible quotes" disabled={busy||loading||!visible.length} checked={!!visible.length&&visible.every(w=>selected.has(w.id))} onChange={e=>{const checked=e.target.checked;setSelected(previous=>{const next=new Set(previous);visible.forEach(w=>checked?next.add(w.id):next.delete(w.id));return next;});}}/></TableHead>
   {[['Project name','title'],['Client name','client_name'],['Quote Total','quote_total'],['Quote Status','quote_status'],['Forecast Status','forecast_status'],['Project Status','project_status'],['Use for Capacity','capacity_selected'],['Date created','created_at'],['Last modified','last_modified'],['CAD Turnover','cad'],['BOM',''],['Budget Handoff','']].map(([h,key])=><TableHead key={h} style={{position:'relative'}} aria-sort={sort.key===key?(sort.direction===1?'ascending':'descending'):undefined}>{key?<button onClick={()=>setSort({key:key as keyof Workspace|'cad',direction:sort.key===key?-sort.direction:1})}>{h} {sort.key===key?(sort.direction===1?'↑':'↓'):'↕'}</button>:h}<QuoteColumnResize label={h}/></TableHead>)}
  </TableRow></TableHeader><TableBody>{loading?<TableRow><TableCell colSpan={13}>Loading quotes…</TableCell></TableRow>:visible.length===0?<TableRow><TableCell colSpan={13}>No quotes found.</TableCell></TableRow>:displayRows.map(({w,group,child,expanded})=><TableRow key={w.id} className={child?"bg-muted/40":undefined}>
   <TableCell><input type="checkbox" aria-label={`Select ${w.title}`} disabled={busy} checked={selected.has(w.id)} onChange={e=>toggle(w.id,e.target.checked)}/></TableCell>
   <TableCell><div className={`flex items-center gap-2 ${child?'pl-5 border-l-2 border-border':''}`}><DropdownMenu><DropdownMenuTrigger disabled={busy} aria-label={`Quote actions · ${w.title}`} className="rounded px-2 py-1 hover:bg-slate-100">⋮</DropdownMenuTrigger><DropdownMenuContent>
     {!archived&&<DropdownMenuItem onClick={()=>open('rename',w)}>Rename</DropdownMenuItem>}{!archived&&<DropdownMenuItem onClick={()=>open('group',w)}>Group / change project</DropdownMenuItem>}<DropdownMenuItem disabled={!ready||!w.workbook_revision} onClick={()=>open('clone',w)}>Clone</DropdownMenuItem><DropdownMenuItem onClick={()=>void lifecycle([w.id],archived)}>{archived?'Restore':'Archive'}</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu><Link className="font-semibold hover:underline" href={`/quotes/${w.id}`}>{w.title}</Link></div>{!child&&group.others.length>0&&<button type="button" className="mt-1 ml-9 text-xs text-muted-foreground hover:text-foreground hover:underline" aria-expanded={expanded} aria-label={`Other versions of ${w.title}`} disabled={filtered} onClick={()=>toggleGroup(group.id)}>{expanded?'▾':'▸'} {group.others.length} other version{group.others.length===1?'':'s'}{filtered?' · shown for search/filter':''}</button>}{child&&<span className="ml-14 text-xs text-muted-foreground">Other version</span>}{!child&&!w.capacity_selected&&group.others.length>0&&<p className="ml-9 text-xs text-amber-800">No version selected for capacity</p>}</TableCell><TableCell>{w.client_name||'—'}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{w.quote_total==null?'—':w.quote_total.toLocaleString('en-US',{style:'currency',currency:'USD'})}</TableCell>
   <TableCell><select className="rounded border p-1.5" aria-label={`Quote Status · ${w.title}`} disabled={busy||archived||!ready} value={w.quote_status} onChange={e=>void changeStatus(w,e.target.value)}><option value="draft">Draft</option><option value="final" disabled={!w.workbook_revision}>Final</option></select></TableCell>
   <TableCell><select aria-label={`Forecast Status · ${w.title}`} className="rounded border p-1.5 max-w-full" disabled={busy||archived||!w.workbook_revision} value={w.forecast_status} onChange={e=>void changeForecast(w,e.target.value)}><option value="" disabled hidden>Not Set</option>{SALES_FORECAST_STATUSES.map(status=><option key={status} value={status}>{forecastLabel(status)}</option>)}</select></TableCell>
   <TableCell><select aria-label={`Project Status · ${w.title}`} className="rounded border p-1.5 max-w-full" disabled={busy||archived||!w.workbook_revision} value={w.project_status} onChange={e=>void changeForecast(w,e.target.value,true)}>{PROJECT_STATUSES.map(status=><option key={status}>{status}</option>)}</select></TableCell>
   <TableCell><button className="rounded border px-2 py-1 text-xs" disabled={busy||archived||w.capacity_selected} onClick={()=>void useCapacity(w)}>{w.capacity_selected?'✓ Used for Capacity':'Use for Capacity'}</button><div className="text-xs text-muted-foreground">{group.others.length+1} version(s)</div></TableCell>
   <TableCell className="whitespace-nowrap">{date(w.created_at)}</TableCell><TableCell className="whitespace-nowrap">{date(w.last_modified)}</TableCell>
   <TableCell>{w.quote_status==='final'?<QuoteCadDownload workspaceId={w.id} version={w.status_version}/>:<span className="text-xs text-muted-foreground">Available when Final</span>}</TableCell>
   {['BOM','Budget Handoff'].map(tab=><TableCell key={tab}>{w.workbook_revision?<Link className="underline text-teal-800" href={`/quotes/${w.id}?tab=${encodeURIComponent(tab)}`}>Open {tab}</Link>:<span className="text-xs text-muted-foreground">No saved workbook</span>}</TableCell>)}
  </TableRow>)}</TableBody></Table></Card>
  {dialog?<div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label={dialog==='create'?'Create quote':dialog==='clone'?'Clone quote':dialog==='group'?'Group quote versions':'Rename quote'}><form className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl" onSubmit={submit}>
   <h2 className="text-lg font-semibold">{dialog==='create'?'New quote':dialog==='clone'?'Clone quote':dialog==='group'?'Group quote versions':'Rename quote'}</h2>
   {dialog==='group'?<><p className="mt-3 text-sm">Join this quote to another project. It will stop contributing hours; the destination’s selected version stays in use. Other versions and saved data remain unchanged.</p><label className="block mt-4">Project<select name="targetId" required className="block w-full border p-2"><option value="">Choose project quote</option><option value="separate">Separate project — use this quote for capacity</option>{rows.filter(w=>w.id!==target?.id&&w.capacity_group!==target?.capacity_group).map(w=><option key={w.id} value={w.id}>{w.title}{w.capacity_selected?' (used for capacity)':''}</option>)}</select></label></>:null}
   {dialog!=='group'&&<label className="block mt-4">Project Name<Input name="title" autoFocus required maxLength={300} defaultValue={dialog==='clone'?target?.title+' CLONE':dialog==='rename'?target?.title:''}/></label>}
   {dialog==='clone'?<p className="text-sm mt-2">Copies the latest saved workbook, including its prices and settings, into a new Draft. The source and its revision history stay unchanged.</p>:null}
   {dialog!=='rename'&&dialog!=='group'?<label className="block mt-4">Client Name<Input name="clientName" required maxLength={300} defaultValue={dialog==='clone'?target?.client_name??'':''}/></label>:null}
   {dialog==='create'?<label className="block mt-4">Contact (optional)<Input name="contactName"/></label>:null}
   {dialog==='clone'?<label className="block mt-4">Clone as<select name="sameProject" defaultValue="yes" className="block w-full border p-2"><option value="yes">New version of this project</option><option value="no">Separate project</option></select></label>:null}
   {dialog==='clone'?<label className="block mt-4 text-sm"><input type="checkbox" name="copySchedule"/> Also copy dates and forecast/planning status (new versions stay out of Capacity until selected)</label>:null}
   {error?<p className="mt-3 text-red-700" role="alert">{error}</p>:null}
   <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setDialog(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Saving…':dialog==='create'?'Create quote':dialog==='clone'?'Clone quote':dialog==='group'?'Save grouping':'Save name'}</Button></div>
  </form></div>:null}
 </PageShell>;
}
