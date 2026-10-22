'use client';
import {useCallback,useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {dateString,dayNumber,type RosterPerson} from '@/lib/capacity';
import type {TeamOptions,TeamResult} from '@/lib/team-schedule';
import {TeamGantt} from './team-gantt';
import {capacityTrade} from '@/lib/capacity-trades';
import styles from './capacity-tracker.module.css';
type Result=TeamResult&{projects:{id:string;name:string;status:string}[]};
type Saved={revision:number;created_at:string;document:{result:Result}};
type State={latest:Saved|null;approved:Saved|null;stale:boolean;approvedStale:boolean};
const n=(v:number)=>v.toLocaleString(undefined,{maximumFractionDigits:1});
const attentionNotes:Record<string,string>={
 'Build deadline is before this schedule':'The build deadline falls before this schedule starts. If the project is finished, mark it Completed. Otherwise, review its build dates and remaining work.',
 'Prerequisite unfinished or missing':'An earlier production step could not be scheduled or has not been marked complete. Review that step before scheduling the work that follows.',
 'No active employee with this trade':'No active roster member has this trade listed. Review primary and secondary trades on the roster.',
 'Task starts beyond this schedule':'This work starts after the saved schedule ends. Extend the schedule dates when you are ready to plan it.',
 'Insufficient availability inside fixed task dates':'The available team hours do not fit within this task’s fixed dates. Review staffing or the approved task dates.',
 'Insufficient eligible hours before deadline or end of view':'The scheduler could not fit all of this work before its deadline or the end of the saved schedule. Review staffing, work dates and the schedule range.',
};
function SchedulingAttention({result}:{result:Result}){
 const projects=new Map<string,{name:string;rows:TeamResult['unfilled']}>();
 for(const row of result.unfilled){
  const id=row.taskKey.split('|')[0];
  const group=projects.get(id)??{name:row.project,rows:[]};
  group.rows.push(row);projects.set(id,group);
 }
 return <section className={styles.attention} aria-label="Projects Needing Scheduling Attention">
  <h3>Projects Needing Scheduling Attention</h3>
  <p>Open a project to see what needs review. Hours shown here are not assigned yet; they do not always mean you need more staff. This covers the full saved schedule.</p>
  {Array.from(projects,([id,group])=><details key={id} className={styles.attentionProject}>
   <summary><strong>{group.name}</strong><span>{n(group.rows.reduce((sum,row)=>sum+row.hours,0))} hours to review</span></summary>
   <div className={styles.attentionNotes}>{Array.from(new Set(group.rows.map(row=>row.reason)),reason=>{
    const rows=group.rows.filter(row=>row.reason===reason);
    return <div key={reason} className={styles.attentionNote}>
     <p>{attentionNotes[reason]??reason}</p>
     <ul>{rows.map(row=><li key={row.taskKey}><strong>{row.item}</strong> · {row.trade} · {n(row.hours)} hours</li>)}</ul>
    </div>;
   })}</div>
  </details>)}
  {!projects.size&&<p>No unassigned work in this saved schedule.</p>}
 </section>;
}
export function TeamSchedule({disabled}:{roster:RosterPerson[];disabled:boolean}){
 const today=new Date().toLocaleDateString('en-CA');
 const [options,setOptions]=useState<TeamOptions>({start:today,finish:dateString(dayNumber(today)+27),priority:[],availability:[]});
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[view,setView]=useState('latest'),[person,setPerson]=useState(''),[project,setProject]=useState(''),[trade,setTrade]=useState('');
 const reload=useCallback(async()=>{const r=await adaFetch('/api/capacity/team-schedule'),p=await r.json();if(!r.ok)throw Error(p.error);setState(p);},[]);
 useEffect(()=>{void reload().catch(e=>setError(e.message));},[reload]);
 const saved=view==='approved'?state?.approved:state?.latest,result=saved?.document.result;
 const stale=view==='approved'?state?.approvedStale:state?.stale;
 async function save(action:'generate'|'approve'){
  if(action==='approve'&&!window.confirm(`Approve these daily assignments? ${n(result?.unfilled.reduce((s,t)=>s+t.hours,0)??0)} hours remain unassigned. The prior approved schedule stays in history.`))return;
  setBusy(true);setError('');try{const r=await adaFetch('/api/capacity/team-schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,expectedVersion:state?.latest?.revision??0,options:{...options,priority:state?.latest?.document.result.options.priority??[],availability:(state?.latest?.document.result.options.availability??[]).filter(a=>a.date>=options.start&&a.date<=options.finish)}})}),p=await r.json();if(!r.ok)throw Error(p.error);setView('latest');await reload();}catch(e){setError(e instanceof Error?e.message:'Save failed.');}finally{setBusy(false);}
 }
 const rows=result?.allocations.filter(a=>a.date>=options.start&&a.date<=options.finish&&(!person||a.personId===person)&&(!project||a.workspaceId===project)&&(!trade||capacityTrade(a.trade)===trade))??[];
 return <section><h2>Team Schedule</h2><p>Closed won and In production only. Daily shop assignments across all accessible projects, including I&D staff for stage, pack and prep. CAD and field bookings remain separate. Primary trades first, then secondary skills within the same person’s hours.</p>
 <div className={styles.toolbar}><label>From<input aria-label="Schedule start date" type="date" value={options.start} onInput={e=>{const value=e.currentTarget.value;setOptions(current=>({...current,start:value}));}} onBlur={e=>{const value=e.currentTarget.value;setOptions(current=>({...current,start:value}));}}/></label><label>Through<input aria-label="Schedule end date" type="date" value={options.finish} onInput={e=>{const value=e.currentTarget.value;setOptions(current=>({...current,finish:value}));}} onBlur={e=>{const value=e.currentTarget.value;setOptions(current=>({...current,finish:value}));}}/></label><button onClick={()=>setOptions({...options,start:today,finish:dateString(dayNumber(today)+27)})}>Next 4 weeks</button></div>
 {result&&<> <div className={styles.toolbar}><label>Employee<select value={person} onChange={e=>setPerson(e.target.value)}><option value="">All employees</option>{result.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Project<select value={project} onChange={e=>setProject(e.target.value)}><option value="">All projects</option>{result.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Trade<select value={trade} onChange={e=>setTrade(e.target.value)}><option value="">All trades</option>{Array.from(new Set([...result.allocations.map(a=>capacityTrade(a.trade)),...result.unfilled.map(a=>capacityTrade(a.trade))])).sort().map(t=><option key={t}>{t}</option>)}</select></label><button onClick={()=>{setPerson('');setProject('');setTrade('');}}>Show all</button></div>
 <TeamGantt key={`${saved?.revision}|${view}`} result={result} filter={{person,project,trade}} range={{start:options.start,finish:options.finish}}/>
</>}
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 <div className={styles.toolbar}><button disabled={busy||disabled||!state} onClick={()=>void save('generate')}>Generate & save proposal</button><button disabled={busy} onClick={()=>void reload().then(()=>setError('')).catch(e=>setError(e.message))}>Reload saved schedule</button><label>View<select value={view} onChange={e=>setView(e.target.value)}><option value="latest">Latest proposal / schedule</option><option value="approved">Last approved schedule</option></select></label></div>
 {result?<><h3>{state?.approved?.revision===saved?.revision?'Approved':'Proposed'} · revision {saved?.revision}</h3><p>{result.options.start} — {result.options.finish} · {result.projects.length} projects · {n(result.assignedHours)} assigned / {n(result.totalHours)} required hours · {n(result.unfilled.reduce((s,t)=>s+t.hours,0))} unassigned</p>{stale&&<p role="alert" className={styles.error}>Project or team information has changed since this schedule was saved. Click “Generate & save proposal” to refresh it before approval. Your saved schedule is still intact.</p>}
 <p>Saved availability exceptions within the selected dates are retained when generating. Field crew bookings remain separate; review the shared I&D capacity chart before approving packing assignments.</p>
 <p>These are hours per day, not clock-time shifts. Build deadlines stay fixed; unfinished prerequisites block downstream work. Approved project task windows are respected. Review shortages and CAD readiness before releasing assignments.</p>
 {view==='latest'&&state?.approved?.revision!==saved?.revision&&<button disabled={disabled||busy||stale} onClick={()=>void save('approve')}>Approve assigned work</button>}
 <details><summary>Daily assignment list ({rows.length})</summary><div className={styles.scroll} style={{maxHeight:'60vh'}}><table aria-label="Team daily assignments"><thead><tr>{['Date','Employee','Project','Item','Trade','Hours','Skill'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((a,i)=><tr key={i}><td>{a.date}</td><th>{a.person}</th><td>{a.project}</td><td>{a.item}</td><td>{a.trade}</td><td>{n(a.hours)}</td><td>{a.secondary?'Secondary':'Primary'}</td></tr>)}</tbody></table>{!rows.length&&<p>No assignments in this view.</p>}</div></details>
 <SchedulingAttention result={result}/>
 {result.warnings.length>0&&<details><summary>Planning assumptions and warnings ({result.warnings.length})</summary><ul>{result.warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}</>:<p>No saved schedule in this view. Generate a proposal to review daily assignments.</p>}
 </section>;
}
