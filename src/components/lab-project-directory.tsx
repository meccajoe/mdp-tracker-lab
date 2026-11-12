'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Search} from 'lucide-react';
import {adaFetch} from '@/lib/ada-client';
import type {LabDirectoryProject} from '@/lib/lab-project-directory';
import {projectDate} from '@/lib/lab-project-presentation';
import {PM_NAMES} from '@/lib/types';
import {LabProjectSyncStatus} from '@/components/lab-project-sync-status';
import {PageShell} from '@/components/ui/page-shell';
const cash=(n:number|null)=>n==null?'Not imported':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
export function LabProjectDirectory({dashboard=false}:{dashboard?:boolean}){
 const [projects,setProjects]=useState<LabDirectoryProject[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const [search,setSearch]=useState(''),[status,setStatus]=useState('Active'),[pm,setPm]=useState('All'),[sort,setSort]=useState('name'),[direction,setDirection]=useState(1);
 useEffect(()=>{let current=true;setLoading(true);setError('');adaFetch('/api/projects/lab-directory').then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error||'Projects could not load.');if(current){setProjects(body.projects);setLoading(false);}}).catch(e=>{if(current){setError(e instanceof Error?e.message:'Projects could not load.');setLoading(false);}});return()=>{current=false;};},[attempt]);
 useEffect(()=>{const refresh=()=>setAttempt(n=>n+1);window.addEventListener('lab-project-sync-complete',refresh);return()=>window.removeEventListener('lab-project-sync-complete',refresh);},[]);
 const filtered=projects.filter(p=>(status==='All'||p.status===status)&&(pm==='All'||p.pm===pm)&&(!search.trim()||[p.name,p.client,p.job_number].some(v=>String(v??'').toLowerCase().includes(search.trim().toLowerCase())))).sort((a,b)=>{
  const left=a[sort],right=b[sort];if(left==null||right==null)return left==null?(right==null?0:1):-1;
  return (typeof left==='number'?left-right:String(left).localeCompare(String(right),undefined,{numeric:true}))*direction;
 });
 const managers=[...new Set(projects.map(p=>p.pm).filter(Boolean))] as string[];
 const active=projects.filter(p=>p.status==='Active'),imported=projects.filter(p=>p.capturedAt);
 function order(key:string){if(sort===key)setDirection(d=>-d);else{setSort(key);setDirection(1);}}
 const cost=(p:LabDirectoryProject)=>p.activityState==='link-changed'||p.activityState==='reconcile'?'Review source':p.cost==null?'Not imported':cash(p.cost)+(p.incomplete?' + pending':'');
 return <PageShell className="pm-worklist-page pm-readable-financials space-y-0 sm:space-y-0"><header className="pm-directory-header"><div><h1>{dashboard?'Dashboard':'Projects'}</h1><p className="pm-section-intro">{dashboard?'Project status, quoted budgets and recorded activity.':'Find a project and open it to see the details.'}</p></div>{dashboard&&<Link className="pm-text-action" href="/projects">All projects<ArrowUpRight aria-hidden="true"/></Link>}</header>
  <LabProjectSyncStatus/>
  {dashboard&&!loading&&!error&&<dl className="pm-status-strip"><div><span><dt>Active projects</dt><dd>{active.length}</dd></span></div><div><span><dt>Quoted value · active projects</dt><dd>{cash(active.reduce((n,p)=>n+p.quotePrice,0))}</dd></span></div><div><span><dt>Activity imported</dt><dd>{imported.length} of {projects.length} projects</dd></span></div></dl>}
  <div className="pm-worklist-toolbar"><label className="pm-search"><Search aria-hidden="true"/><span className="sr-only">Search projects</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search project, client or job number…"/></label></div>
  <div className="flex flex-wrap gap-2 py-4" role="group" aria-label="Project status">{['Active','Pending','On Hold','Completed','All'].map(value=><button type="button" key={value} aria-pressed={status===value} onClick={()=>setStatus(value)} className={`rounded-md px-3 py-2 text-sm font-medium ${status===value?'bg-primary text-primary-foreground':'bg-muted/50 hover:bg-muted'}`}>{value==='All'?'All statuses':value}</button>)}</div>
  <div className="pm-directory-controls"><p className="pm-table-subtitle">{filtered.length} projects · {status==='All'?'All statuses':status}</p><details className="pm-directory-filters"><summary>PM and sort</summary><div><label>Project manager<select aria-label="Project manager" value={pm} onChange={e=>setPm(e.target.value)}><option value="All">All project managers</option>{managers.map(value=><option key={value} value={value}>{PM_NAMES[value]||value}</option>)}</select></label><label>Sort by<select aria-label="Sort by" value={sort} onChange={e=>{setSort(e.target.value);setDirection(1);}}>{[['name','Project name'],['due_date','Delivery date'],['job_number','Job number'],['quotePrice','Lab quote'],['cost','Recorded cost']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div></details></div>
  {loading?<p role="status" className="pm-quiet-state">Loading projects…</p>:error?<p role="alert" className="pm-evidence-note">{error} <button className="pm-text-action" onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>:<section>
   <div className="pm-worklist-table-wrap" data-layout="responsive-table"><table className="pm-simple-table lab-project-directory-table" data-layout="fluid-table"><thead><tr>{[['job_number','Job #'],['name','Project / client'],['pm','PM'],['status','Status'],['quotePrice','Lab quote'],['percent','Budget used'],['cost','Recorded cost'],['due_date','Delivery']].map(([key,label])=><th key={key} aria-sort={sort===key?(direction===1?'ascending':'descending'):'none'}><button className="min-h-10 text-left" onClick={()=>order(key)}>{label}{sort===key?(direction===1?' ↑':' ↓'):''}</button></th>)}</tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td>{p.job_number||'Pending'}</td><td><Link href={`/projects/${p.id}`} className="font-semibold hover:underline">{p.name}</Link><span className="pm-table-subtitle">{p.client||'No client'}</span></td><td>{PM_NAMES[p.pm]||p.pm||'Not assigned'}</td><td><span className={`pm-project-status ${p.status==='Active'?'':'held'}`}>{p.status}</span></td><td>{cash(p.quotePrice)}</td><td>{p.percent==null?'Not available':`${p.incomplete?'≥ ':''}${p.percent.toFixed(1)}%`}</td><td>{cost(p)}</td><td>{projectDate(p.due_date)}</td></tr>)}</tbody></table></div>
   <ul className="lab-project-mobile-list" data-layout="responsive-list">{filtered.map(p=><li key={p.id}><Link href={`/projects/${p.id}`} className="text-base font-semibold">{p.name}</Link><p className="pm-table-subtitle">#{p.job_number||'Pending'} · {p.client||'No client'}</p><dl><div><dt>Project manager</dt><dd>{PM_NAMES[p.pm]||p.pm||'Not assigned'}</dd></div><div><dt>Status</dt><dd>{p.status}</dd></div><div><dt>Lab quote</dt><dd>{cash(p.quotePrice)}</dd></div><div><dt>Recorded cost</dt><dd>{cost(p)}</dd></div><div><dt>Delivery</dt><dd>{projectDate(p.due_date)}</dd></div><div><dt>Budget used</dt><dd>{p.percent==null?'Not available':`${p.incomplete?'at least ':''}${p.percent.toFixed(1)}%`}</dd></div></dl></li>)}</ul>
   {!filtered.length&&<p className="pm-quiet-state">No projects found.</p>}
  </section>}
  <p className="pm-worklist-footnote">Budgets come from each project’s saved Lab quote. Recorded costs use dated activity snapshots. “Not imported” is unknown, not zero; missing labor costs remain pending.</p>
 </PageShell>;
}
