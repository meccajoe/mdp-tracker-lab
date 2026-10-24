'use client';
import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {dateString,dayNumber} from '@/lib/capacity';
import type {TeamOptions,TeamResult} from '@/lib/team-schedule';
import {TeamGantt} from './team-gantt';
import {capacityTrade} from '@/lib/capacity-trades';
import styles from './capacity-tracker.module.css';
type Result=TeamResult&{projects:{id:string;name:string;status:string}[]};
const n=(v:number)=>v.toLocaleString(undefined,{maximumFractionDigits:1});
const attentionNotes:Record<string,string>={
 'Build deadline is before this schedule':'The build deadline falls before this schedule starts. If the project is finished, set Project Status to Complete. Otherwise, review its build dates and remaining work.',
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
  <p>Open a project to see what needs review. Hours shown here are not assigned yet; they do not always mean you need more staff. This covers the schedule shown above.</p>
  {Array.from(projects,([id,group])=><details key={id} className={styles.attentionProject}>
   <summary><strong>{group.name}</strong><span>{n(group.rows.reduce((sum,row)=>sum+row.hours,0))} hours to review</span></summary>
   <div className={styles.attentionNotes}>{Array.from(new Set(group.rows.map(row=>row.reason)),reason=>{
    const rows=group.rows.filter(row=>row.reason===reason);
    return <div key={reason} className={styles.attentionNote}>
     <p>{attentionNotes[reason]??reason}</p>
     <ul>{rows.map(row=><li key={row.taskKey}><strong>{row.item}</strong> · {row.trade} · {n(row.hours)} hours{row.recommendation&&<p><strong>Recommended fix:</strong> {row.recommendation}</p>}</li>)}</ul>
    </div>;
   })}</div>
  </details>)}
  {!projects.size&&<p>No unassigned work in this schedule.</p>}
 </section>;
}
export function TeamSchedule(){
 const today=new Date().toLocaleDateString('en-CA');
 const [options,setOptions]=useState<TeamOptions>({start:today,finish:dateString(dayNumber(today)+27),priority:[],availability:[]});
 const [result,setResult]=useState<Result>(),[error,setError]=useState(''),[loading,setLoading]=useState(true),[person,setPerson]=useState(''),[project,setProject]=useState(''),[trade,setTrade]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let active=true,running=false,generation=0;
  setResult(undefined);setLoading(true);setError('');
  const read=async()=>{
   if(running)return;running=true;const current=++generation;
   try{
    const response=await adaFetch('/api/capacity/team-schedule?view=live&start='+encodeURIComponent(options.start)+'&finish='+encodeURIComponent(options.finish));
    const payload=await response.json();if(!response.ok)throw Error(payload.error);
    if(active&&current===generation){setResult(payload.result);setError('');}
   }catch(e){if(active){setResult(undefined);setError(e instanceof Error?e.message:'Schedule unavailable.');}}
   finally{running=false;if(active)setLoading(false);}
  };
  const update=()=>{if(document.visibilityState==='visible')void read();};
  const identity=()=>{setResult(undefined);setRefresh(value=>value+1);};
  const initial=setTimeout(()=>void read(),250),timer=setInterval(update,60000);
  document.addEventListener('visibilitychange',update);
  window.addEventListener('production-plan-saved',update);
  window.addEventListener('quote-library-identity-changed',identity);
  return()=>{active=false;clearTimeout(initial);clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('production-plan-saved',update);window.removeEventListener('quote-library-identity-changed',identity);};
 },[options.start,options.finish,refresh]);
 const rows=result?.allocations.filter(a=>a.date>=options.start&&a.date<=options.finish&&(!person||a.personId===person)&&(!project||a.workspaceId===project)&&(!trade||capacityTrade(a.trade)===trade))??[];
 return <section aria-label="Team Schedule">
 <div className={styles.toolbar}><div className={styles.scheduleDateFields}><label>From<input aria-label="Schedule start date" type="date" value={options.start} onInput={e=>{const value=e.currentTarget.value;setOptions(current=>({...current,start:value}));}} onBlur={e=>{const value=e.currentTarget.value;setOptions(current=>({...current,start:value}));}}/></label><label>Through<input aria-label="Schedule end date" type="date" value={options.finish} onInput={e=>{const value=e.currentTarget.value;setOptions(current=>({...current,finish:value}));}} onBlur={e=>{const value=e.currentTarget.value;setOptions(current=>({...current,finish:value}));}}/></label><button onClick={()=>setOptions({...options,start:today,finish:dateString(dayNumber(today)+27)})}>Next 4 weeks</button></div>
 <div aria-live="polite" className={styles.liveScheduleSummary}>
 {result?<><strong className={styles.liveScheduleTitle}>Live Schedule</strong><p>{options.start} — {options.finish} · {result.projects.length} projects · {n(result.assignedHours)} assigned / {n(result.totalHours)} required hours · {n(result.unfilled.reduce((sum,t)=>sum+t.hours,0))} unassigned</p><small>Includes all active project work; hours that cannot fit these dates remain unassigned.</small>{result.allocations.some(a=>a.workMode&&a.workMode!=='Regular')&&<p style={{color:'#9a4b0b'}}><strong>Extra shifts required: {n(result.allocations.filter(a=>a.workMode==='Weekday overtime').reduce((sum,a)=>sum+a.hours,0))}h weekday overtime · {n(result.allocations.filter(a=>a.workMode==='Weekend').reduce((sum,a)=>sum+a.hours,0))}h weekend</strong></p>}</>:loading?<p>Loading active projects…</p>:null}
 </div></div>
 {result&&<> <div className={styles.toolbar}><label>Employee<select value={person} onChange={e=>setPerson(e.target.value)}><option value="">All employees</option>{result.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Project<select value={project} onChange={e=>setProject(e.target.value)}><option value="">All projects</option>{result.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Trade<select value={trade} onChange={e=>setTrade(e.target.value)}><option value="">All trades</option>{Array.from(new Set([...result.allocations.map(a=>capacityTrade(a.trade)),...result.unfilled.map(a=>capacityTrade(a.trade))])).sort().map(t=><option key={t}>{t}</option>)}</select></label><button onClick={()=>{setPerson('');setProject('');setTrade('');}}>Show all</button></div>
 <TeamGantt result={result} filter={{person,project,trade}} range={{start:options.start,finish:options.finish}}/>
 <section className={styles.attention} aria-label="Overtime and shared capacity">
 <h3>Automatic staffing adjustments</h3>
 {!!result.crewAdjustments?.length&&<details open><summary>Added crew to meet deadlines ({result.crewAdjustments.length})</summary><ul>{result.crewAdjustments.map((a,i)=><li key={i}><strong>{a.project} · {a.item}</strong> — {a.date}: {a.people} people, {n(a.hours)}h {a.trade}</li>)}</ul></details>}
 <p>Staffing changes are applied to this live schedule. Extra people share the quoted hours; overtime can increase labor cost. Quoted budgets remain unchanged so production can track the variance. Additional hires are recommendations, not confirmed staff.</p>
 <p>Additional qualified people in normal hours first, then up to 4 extra hours per weekday, then up to 8 hours Saturday and 8 hours Sunday per person. Extra time is shared across all active projects. Saved absences, holidays, dependencies and fixed dates still apply. Quote prices and approved schedules stay unchanged.</p>
 {result.allocations.some(a=>a.workMode&&a.workMode!=='Regular')?<><p role="status"><strong>Regular hours are not enough. {n(result.allocations.filter(a=>a.workMode==='Weekday overtime').reduce((s,a)=>s+a.hours,0))} weekday overtime hours + {n(result.allocations.filter(a=>a.workMode==='Weekend').reduce((s,a)=>s+a.hours,0))} weekend hours are planned.</strong> Production team: review these extra shifts.</p>
 <ul>{result.projects.filter(p=>result.allocations.some(a=>a.workspaceId===p.id&&a.workMode&&a.workMode!=='Regular')).map(p=><li key={p.id}><strong>{p.name}</strong> — {n(result.allocations.filter(a=>a.workspaceId===p.id&&a.workMode==='Weekday overtime').reduce((s,a)=>s+a.hours,0))}h weekday overtime; {n(result.allocations.filter(a=>a.workspaceId===p.id&&a.workMode==='Weekend').reduce((s,a)=>s+a.hours,0))}h weekend</li>)}</ul></>:<p>No extra shifts could improve this schedule, or regular hours are sufficient. Review any unassigned work below.</p>}
 {!!result.pressure?.length&&<details><summary>Shared teams near capacity ({result.pressure.length})</summary><p>At least 85% of normal available hours are occupied. Projects listed share these people, including secondary trades.</p><ul>{result.pressure.map((p,i)=><li key={i}><strong>{p.trade} · week of {p.week} · {n(p.utilization*100)}%</strong> — {p.projects.join(', ')}</li>)}</ul></details>}
 </section>

</>}
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 {error&&<button onClick={()=>setRefresh(value=>value+1)}>Retry loading schedule</button>}
 {result&&<>
 <details><summary>Daily assignment list ({rows.length})</summary><div className={styles.scroll} style={{maxHeight:'60vh'}}><table aria-label="Team daily assignments"><thead><tr>{['Date','Employee','Project','Item','Trade','Hours','Shift','Skill'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((a,i)=><tr key={i}><td>{a.date}</td><th>{a.person}</th><td>{a.project}</td><td>{a.item}</td><td>{a.trade}</td><td>{n(a.hours)}</td><td>{a.workMode??'Regular'}</td><td>{a.secondary?'Secondary':'Primary'}</td></tr>)}</tbody></table>{!rows.length&&<p>No assignments in this view.</p>}</div></details>
 {!!result.preparation?.length&&<details open><summary>CAD / Drawings schedule — separate from shop assignments</summary><table aria-label="CAD schedule"><thead><tr>{['Project','Activity','Start','Finish','Quoted hours'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{result.preparation.filter(p=>!project||result.projects.find(q=>q.id===project)?.name===p.project).map((p,i)=><tr key={i}><th>{p.project}</th><td>{p.item}</td><td>{p.start}</td><td>{p.finish}</td><td>{n(p.hours)}</td></tr>)}</tbody></table><p>Planned CAD work is shown for readiness. These hours are separate from named shop assignments.</p></details>}
 <SchedulingAttention result={result}/>
 {result.warnings.length>0&&<details><summary>Planning assumptions and warnings ({result.warnings.length})</summary><ul>{result.warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}</>}
 </section>;
}
