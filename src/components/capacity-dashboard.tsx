'use client';
import {useId,useMemo,useState} from 'react';
import {dashboardLoad,type CapacityProject,type DemandBasis} from '@/lib/capacity-dashboard';
import {dateString,dayNumber,monday,SHOP_TRADES,SUPPORT_TRADES,type CapacitySettings} from '@/lib/capacity';
import styles from './capacity-dashboard.module.css';
const number=(value:number)=>value.toLocaleString('en-US',{maximumFractionDigits:1});
const date=(value:string)=>new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const total=(values:number[])=>values.reduce((sum,value)=>sum+value,0);
function LaborChart({title,weeks,needed,available}:{title:string;weeks:string[];needed:number[];available:number|null}){
 const id=useId(),max=Math.max(1,available??0,...needed)*1.12;
 const width=440,height=210,left=48,right=10,top=20,bottom=44,plot=height-top-bottom,step=(width-left-right)/weeks.length;
 const y=(value:number)=>top+plot-value/max*plot;
 return <section className={styles.chart} aria-label={title}><header><h2>{title}</h2></header><div className={styles.tileTotals}><strong>{number(total(needed))} h <small>needed</small></strong><span>{available===null?'Capacity not configured':`${number(available*weeks.length)} h available`}</span></div>
 <div className={styles.chartScroll}><svg viewBox={`0 0 ${width} ${height}`}  role="img" aria-labelledby={`${id}-title ${id}-description`}><title id={`${id}-title`}>{title}</title><desc id={`${id}-description`}>Weekly labor hours from {weeks[0]} through {dateString(dayNumber(weeks.at(-1)!)+6)}. Available capacity {available===null?'not configured':`${number(available)} hours per week`}. Exact values follow in Weekly values.</desc>
 {[0,.25,.5,.75,1].map(fraction=><g key={fraction}><line x1={left} x2={width-right} y1={y(max*fraction)} y2={y(max*fraction)} stroke="#e2e8ef"/><text x={left-8} y={y(max*fraction)+4} textAnchor="end" fill="#68798c" fontSize="11">{number(max*fraction)}</text></g>)}
 <text x="8" y="12" fill="#68798c" fontSize="10">HOURS</text>
 {weeks.map((week,i)=>{const x=left+step*i+step/2,bar=Math.min(22,step*.28),demand=needed[i]??0,excess=available===null?0:Math.max(0,demand-available);return <g key={week}><title>{date(week)}–{date(dateString(dayNumber(week)+6))}: {number(demand)} needed; {available===null?'capacity not configured':`${number(available)} available; ${number(excess)} over`}</title>{available!==null&&<rect x={x-bar-2} y={y(available)} width={bar} height={available/max*plot} rx="2" fill="#bdd2e4"/>}<rect x={x+2} y={y(demand)} width={bar} height={demand/max*plot} rx="2" fill="#326f83"/>{excess>0&&<rect x={x+2} y={y(demand)} width={bar} height={excess/max*plot} rx="2" fill="#cc6557"/>}{(i%Math.ceil(weeks.length/6)===0||i===weeks.length-1)&&<><text x={x} y={height-26} textAnchor="middle" fill="#435469" fontSize="11">{date(week)}</text><text x={x} y={height-10} textAnchor="middle" fill="#7a8796" fontSize="10">{week.slice(0,4)}</text></>}</g>;})}</svg></div>
 {available===null&&<p className={styles.warning}>Set available hours in Roster & Settings.</p>}
 <details className={styles.values}><summary>Weekly values</summary><div className={styles.chartScroll}><table><caption>{title} — hours by week</caption><thead><tr><th>Week</th><th>Available hours</th><th>Needed hours</th><th>Over capacity</th></tr></thead><tbody>{weeks.map((week,i)=><tr key={week}><th>{date(week)}–{date(dateString(dayNumber(week)+6))}, {week.slice(0,4)}</th><td>{available===null?'Not configured':number(available)}</td><td>{number(needed[i]??0)}</td><td>{available===null?'—':number(Math.max(0,(needed[i]??0)-available))}</td></tr>)}</tbody></table></div></details></section>;
}
export function CapacityDashboard({projects,settings,settingsUnavailable=false}:{projects:CapacityProject[];settings:CapacitySettings;settingsUnavailable?:boolean}){
 const [selected,setSelected]=useState<string[]|null>(null),[search,setSearch]=useState(''),[start,setStart]=useState(''),[count,setCount]=useState(8),[basis,setBasis]=useState<DemandBasis>('expected');
 const weekStart=start||settings.weekStart;
 const result=useMemo(()=>dashboardLoad(projects,{...settings,weekStart},selected,basis),[projects,settings,weekStart,selected,basis]);
 const {load,capacity}=result;
 const weeks=Array.from({length:count},(_,i)=>dateString(dayNumber(weekStart)+7*i));
 const needed=load.expected.slice(0,count),rosterConfigured=!settingsUnavailable&&settings.roster.some(person=>person.active);
 const available=rosterConfigured?capacity.shop:null;
 const tradeNames=Array.from(new Set([...SHOP_TRADES,...Object.keys(load.trades),...Object.keys(capacity.primary).filter(name=>!SUPPORT_TRADES.includes(name))]));
 const missingStatus=result.projects.filter(project=>!project.status);
 const mismatches=result.projects.filter(project=>Object.values(project.trades).reduce((sum,h)=>sum+h,0)>project.shop+.000001);
 const shown=projects.filter(project=>project.workspace.toLowerCase().includes(search.toLowerCase()));
 const allSelected=selected===null;
 const utilization=available?total(needed)/(available*count)*100:null;
 return <div className={styles.dashboard}>
 <div className={styles.controls}><div><h2>Work vs. capacity</h2><p>Weekly production hours · {date(weeks[0])}, {weeks[0].slice(0,4)} – {date(dateString(dayNumber(weeks.at(-1)!)+6))}, {weeks.at(-1)!.slice(0,4)}</p></div><label>Start week<input aria-label="Chart start week" type="date" value={weekStart} onInput={e=>{if(e.currentTarget.value)setStart(monday(e.currentTarget.value));}} onBlur={e=>{if(e.currentTarget.value)setStart(monday(e.currentTarget.value));}}/></label><label>Show<select aria-label="Chart weeks" value={count} onChange={e=>setCount(Number(e.target.value))}>{[4,8,13,26].map(n=><option key={n} value={n}>{n} weeks</option>)}</select></label><label>Needed hours<select aria-label="Chart demand basis" value={basis} onChange={e=>setBasis(e.target.value as DemandBasis)}><option value="expected">Probability-weighted forecast</option><option value="committed">Committed work only</option><option value="full">Full hours of active quotes</option></select></label></div>
 <details className={styles.projectPicker}><summary>Projects: {allSelected?'All projects':`${result.projects.length} selected`} <span>Choose projects</span></summary><div className={styles.pickerTools}><label>Find project<input aria-label="Find chart project" value={search} onChange={e=>setSearch(e.target.value)}/></label><button onClick={()=>setSelected(null)}>All projects</button><button onClick={()=>setSelected([])}>Clear selection</button></div><div className={styles.projectList}>{shown.map(project=><label key={project.workspaceId}><input type="checkbox" aria-label={`Chart project ${project.workspace}`} checked={allSelected||selected.includes(project.workspaceId)} onChange={e=>setSelected(current=>{const ids=current??projects.map(p=>p.workspaceId);return e.target.checked?[...new Set([...ids,project.workspaceId])]:ids.filter(id=>id!==project.workspaceId);})}/><span><strong>{project.workspace}</strong><small>{project.schedule.buildStart||'No start date'} → {project.schedule.buildFinish||'No finish date'} · {project.status||'No forecast status'}</small></span></label>)}</div>{!shown.length&&<p>No matching projects.</p>}</details>
 <div className={styles.metrics}><div><span>Needed in this period</span><strong>{number(total(needed))}<small> hours</small></strong></div><div><span>Available in this period</span><strong>{available===null?'Not configured':number(available*count)}{available!==null&&<small> hours</small>}</strong></div><div><span>Period utilization</span><strong>{utilization===null?'—':`${number(utilization)}%`}</strong></div><div><span>Weeks over capacity</span><strong>{available===null?'—':needed.filter(n=>n>available).length}<small> / {count}</small></strong></div></div>
 <p className={styles.explanation}>{basis==='expected'?'Needed hours include committed work plus pipeline hours weighted by forecast probability.':basis==='committed'?'Needed hours include Closed won and In production projects only.':'Needed hours include 100% of active quotes, regardless of their forecast probability.'} Lost, Completed and quotes without a forecast status do not add demand. Project filters affect needed hours; available hours remain the full team’s capacity.</p>
 {!result.projects.length&&<p className={styles.warning}>No projects selected. Select projects or choose All projects to show demand.</p>}
 {load.unscheduled.length>0&&<p className={styles.warning}>Not plotted — missing or unusable build dates: {load.unscheduled.join(', ')}.</p>}
 {missingStatus.length>0&&<p className={styles.warning}>No forecast status — excluded from demand: {missingStatus.map(p=>p.workspace).join(', ')}.</p>}
 {mismatches.length>0&&<p className={styles.warning}>Trade hours exceed total shop hours on {mismatches.map(p=>p.workspace).join(', ')}. Reconcile these quote allocations; trade graphs have not been scaled to hide the difference.</p>}
 <div className={styles.tradeHeading}><h2>Shop capacity at a glance</h2><div className={styles.legend}><span><i className={styles.available}/>Available</span><span><i className={styles.needed}/>Needed</span><span><i className={styles.over}/>Over capacity</span></div></div>
 <div className={styles.chartGrid}>
 <LaborChart title="All shop trades combined" weeks={weeks} needed={needed} available={available}/>
 {tradeNames.map(name=><LaborChart key={name} title={name} weeks={weeks} needed={(load.trades[name]??Array(26).fill(0)).slice(0,count)} available={name==='Untyped / other'||!rosterConfigured?null:capacity.primary[name]??0}/>)}
 </div>
 <p className={styles.explanation}>Available hours use active primary-trade roster hours once per week. Secondary skills are shared flexibility, not extra capacity. Shop demand follows each project’s build workweek; CAD and field installation remain separate. These view controls do not change saved quotes, roster settings, or project schedules.</p>
 </div>;
}
