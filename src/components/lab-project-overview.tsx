'use client';
import {useId,useState} from 'react';
import {CalendarDays,ArrowRight,ChevronDown,CircleHelp} from 'lucide-react';
import {PM_NAMES} from '@/lib/types';
import {PM_SLACK_PHOTOS} from '@/lib/lab-project-manager-photos';
import {CountdownClock} from '@/components/countdown-clock';
import {useLabProjectActivity} from '@/components/lab-project-activity-provider';
import {quotedWorkHours,healthMoney,readableProjectDate} from '@/lib/lab-project-presentation';
import type {Payload} from '@/components/lab-project-detail';
const cash=(n:number|null)=>n==null?'Not available':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const number=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:2});
function HelpHint({label,children}:{label:string;children:React.ReactNode}){
 const id=useId(),[open,setOpen]=useState(false);
 return <span className="pm-help" onMouseEnter={()=>setOpen(true)} onMouseLeave={event=>{if(!event.currentTarget.contains(document.activeElement))setOpen(false);}}>
  <button type="button" aria-label={label} aria-describedby={open?id:undefined} aria-expanded={open} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(true)} onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);event.stopPropagation();}}}><CircleHelp aria-hidden="true"/></button>
  {open&&<span id={id} role="tooltip" className="pm-help-popup">{children}</span>}
 </span>;
}
function ManagerAvatar({initials}:{initials:string}){
 const photo=PM_SLACK_PHOTOS[initials];
 return <span className="pm-manager-avatar" aria-hidden="true"><span>{initials||'—'}</span>{photo&&<img key={photo} src={photo} alt="" width={44} height={44} referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;}}/>}</span>;
}
function UsageBar({title,percent}:{title:string;percent:number}){
 return <div className="pm-health-progress" role="progressbar" aria-label={title} aria-valuenow={Math.min(100,Math.max(0,percent))} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${percent.toFixed(1)}% used`}><span className={percent>100?'is-over':''} style={{width:`${Math.min(100,Math.max(0,percent))}%`}}/></div>;
}
function Usage({title,actual,budget,hours=false}:{title:string;actual:number;budget:number;hours?:boolean}){
 const pct=budget>0?actual/budget*100:null,fmt=(n:number)=>hours?number(n)+' hrs':cash(n);
 return <div className="pm-health-metric"><dt>{title}</dt><dd>{fmt(actual)}</dd><div className="pm-metric-usage"><strong className={pct!=null&&pct>100?'is-over':''}>{pct==null?'No positive budget':`${pct.toFixed(1)}% used`}</strong><span>of {fmt(budget)}</span></div>{pct!=null&&<UsageBar title={`${title} budget used`} percent={pct}/>}</div>;
}
export function LabProjectOverview({data,onNavigate}:{data:Payload;onNavigate:(tab:string)=>void}){
 const {data:activity,error,retry}=useLabProjectActivity(),p=data.project,s=data.source.snapshot;
 const summary=activity?.summary??null,m=healthMoney(s.totals.buildBudget,summary),quoted=quotedWorkHours(s.lines);
 const alerts=s.warnings.map((description,i)=>({key:`source-${i}`,title:'Quote and project information',description,tab:'hubspot',action:'Review quote'}));
 if(summary?.missingHours)alerts.push({key:'rates',title:'Labor cost is incomplete',description:`${number(summary.missingHours)} hours have no confirmed pay-rate evidence. Remaining cost budget is unavailable.`,tab:'labor',action:'Review labor'});
 if(summary&&summary.groups.design.hours>quoted.design)alerts.push({key:'design',title:'Design hours exceed the quote allowance',description:`${number(summary.groups.design.hours)} recorded hours against ${number(quoted.design)} quoted hours.`,tab:'budget',action:'View budget detail'});
 const importNote=p.notes?.startsWith('Tracker V2 Lab mirror.');
 const status=['Active','Completed','On Hold','Pending'].includes(p.status)?p.status as 'Active'|'Completed'|'On Hold'|'Pending':'Pending';
 return <div className="pm-overview">
  <dl className="pm-status-strip"><div><CalendarDays aria-hidden="true"/><span><dt>Delivery</dt><dd>{readableProjectDate(p.due_date)}</dd></span></div><div><ManagerAvatar initials={p.pm||''}/><span><dt>Project manager</dt><dd>{s.hubspot.accountManager||(p.pm&&(PM_NAMES[p.pm]||p.pm))||'Not assigned'}</dd></span></div><div><span className="pm-status-dot" data-status={status} aria-hidden="true"/><span><dt>Project status</dt><dd>{p.status}</dd></span></div></dl>
  <section aria-label="Project health" className="pm-project-health"><div className="flex flex-wrap items-center justify-between gap-3"><div className="pm-health-heading"><h2>Project health</h2><HelpHint label="About timeline progress">Timeline progress measures time since the close date, not work completed.</HelpHint></div><button className="pm-text-action" onClick={()=>onNavigate('budget')}>View budget detail<ArrowRight aria-hidden="true"/></button></div>
   {p.due_date?<CountdownClock dueDate={p.due_date} closeDate={p.close_date??undefined} status={status}/>:<p className="pm-table-subtitle mt-3">No delivery date recorded.</p>}
   {error?<p role="alert" className="pm-evidence-note">{error} <button className="pm-text-action" onClick={retry}>Retry activity</button></p>:!activity?<p role="status" className="pm-quiet-state">Loading project health…</p>:!summary?<p className="pm-quiet-state">Activity has not been imported for this project. The quote allocation is available.</p>:<>
    <dl className="pm-health-grid"><div className="pm-health-metric pm-health-primary"><dt>{m.incomplete?'Recorded subtotal':'Recorded cost'}</dt><dd>{cash(m.cost)}</dd><div className="pm-metric-usage"><strong>{m.percent==null?'Percentage unavailable':`${m.incomplete?'at least ':''}${m.percent.toFixed(1)}% used`}</strong><span>of {cash(s.totals.buildBudget)} cost budget</span></div>{m.percent!=null&&<UsageBar title="Recorded cost budget used" percent={m.percent}/>}</div>
    <div className={`pm-health-metric pm-health-primary${m.remaining!=null&&m.remaining<0?' is-over':''}`}><dt>Remaining / overrun</dt><dd>{m.remaining==null?'Not available':cash(Math.abs(m.remaining))}</dd><div className="pm-metric-usage"><strong>{m.remaining==null?'Awaiting complete labor cost':m.remaining<0?'Over budget':'Remaining'}</strong>{summary.pendingExpenses>0&&<span>Includes {cash(summary.pendingExpenses)} in pending expenses</span>}</div></div>
    <Usage title="Shop hours" actual={summary.groups.shop.hours} budget={quoted.shop} hours/><Usage title="Designer hours" actual={summary.groups.design.hours} budget={quoted.design} hours/><Usage title="Materials + other categories" actual={summary.expenses} budget={s.totals.materialsBudget}/></dl>
    <details className="pm-data-disclosure"><summary>About these figures<ChevronDown aria-hidden="true"/></summary><div><p>Hours and costs use the same snapshot and quote revision as Budget Detail. Direct labor follows approved dated costing policies and documented Lab approvals; missing costs remain pending.</p><p>Remaining budget is the cost allowance less recorded costs, not a forecast of remaining work or final profit.</p><p>{cash(summary.pendingExpenses)} in pending amounts is included in recorded expenses.</p><p>Activity captured {new Date(activity.activity!.captured_at).toLocaleString('en-US',{timeZone:'America/Chicago'})} Central.</p></div></details>
   </>}
  </section>
  <section><h2>What needs attention</h2><p className="pm-section-intro">Review these items before your next project update.</p><div className="pm-attention-list">{alerts.map(item=><div className="pm-attention-row" key={item.key}><span className="pm-attention-dot" aria-hidden="true"/><div><h3>{item.title}</h3><p>{item.description}</p></div><button className="pm-text-action" onClick={()=>onNavigate(item.tab)}>{item.action}<ArrowRight aria-hidden="true"/></button></div>)}{!alerts.length&&<p className="pm-quiet-state">{!summary?'Import and review project activity before assessing cost health.':'No alerts found in the available quote and cost evidence. Confirm progress with your team.'}</p>}</div></section>
  <details className="pm-disclosure pm-overview-disclosure pm-notes"><summary><strong>Project notes</strong><ChevronDown aria-hidden="true"/></summary><div className="pm-disclosure-content">{importNote?<><p>{p.notes}</p><p>This note describes the initial import. Current activity availability is shown in Project health above.</p></>:<p>{p.notes||'No project notes recorded.'}</p>}</div></details>
  <details className="pm-disclosure pm-overview-disclosure"><summary><CalendarDays aria-hidden="true"/><strong>Schedule and quote foundation</strong><ChevronDown aria-hidden="true"/></summary><div className="pm-disclosure-content"><dl className="pm-accounting-values">{[['Closed',p.close_date],['Quote due date',s.schedule.dueDate],['Build start',s.schedule.buildStart],['Build finish',s.schedule.buildFinish],['Ship',s.schedule.shipDate],['Install',s.schedule.installDate],['Dismantle',s.schedule.dismantleDate]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value?readableProjectDate(value):'Pending'}</dd></div>)}</dl><p>Original quote: {s.title}. Budget baseline: saved revision {data.source.workbook_revision}. Later quote edits do not silently replace it.</p></div></details>
 </div>;
}
