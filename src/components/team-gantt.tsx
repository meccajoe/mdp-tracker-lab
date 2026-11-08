'use client';
import {useEffect,useMemo,useState,useRef,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {dateString,dayNumber} from '@/lib/capacity';
import {validDate} from '@/lib/quote-schedule';
import {teamGanttRows,teamGanttLanes,type GanttGroup,type GanttResult} from '@/lib/team-gantt';
import styles from './team-gantt.module.css';
const n=(v:number)=>v.toLocaleString(undefined,{maximumFractionDigits:1});
import {TEAM_STAGE_COLORS} from '@/lib/team-stage-colors';
export function TeamGantt({result,filter,range}:{range:{start:string;finish:string};result:GanttResult;filter:{project:string;person:string;trade:string}}){
 const [group,setGroup]=useState<GanttGroup>('Project');
 const [selected,setSelected]=useState<{name:string;date:string;lane:ReturnType<typeof teamGanttLanes>[number];left:number;top:number}|null>(null);
 const bubble=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
 const close=()=>{setSelected(null);trigger.current?.focus({preventScroll:true});};
 useEffect(()=>{
  if(!selected)return;
  bubble.current?.focus({preventScroll:true});
  const outside=(e:PointerEvent)=>{if(!bubble.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setSelected(null);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelected(null);trigger.current?.focus({preventScroll:true});}};
  const scroll=(e:Event)=>{if(!bubble.current?.contains(e.target as Node))setSelected(null);};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',close);document.addEventListener('scroll',scroll,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',close);document.removeEventListener('scroll',scroll,true);};
 },[selected]);
 useEffect(()=>setSelected(null),[result,filter.project,filter.person,filter.trade,range.start,range.finish]);
 const validRange=validDate(range.start)&&validDate(range.finish)&&range.finish>=range.start&&dayNumber(range.finish)-dayNumber(range.start)<=365;
 const start=validRange?range.start:result.options.start,finish=validRange?range.finish:result.options.finish;
 const rows=useMemo(()=>teamGanttRows(result,group,{...filter,start,finish}),[result,group,filter.project,filter.person,filter.trade,start,finish]);
 const allRows=useMemo(()=>new Map(teamGanttRows(result,group,filter).map(row=>[row.id,teamGanttLanes(row)])),[result,group,filter.project,filter.person,filter.trade]);
 const dates=useMemo(()=>Array.from({length:dayNumber(finish)-dayNumber(start)+1},(_,i)=>dateString(dayNumber(start)+i)),[start,finish]);

 const today=new Date().toLocaleDateString('en-CA');
 return <section className={styles.chart} aria-label="Team schedule Gantt chart">
 <div className={styles.controls}><div role="group" aria-label="Group timeline by">{(['Project','Trade','Person'] as const).map(value=><button key={value} aria-pressed={group===value} onClick={()=>{setGroup(value);setSelected(null);}}>{value}</button>)}</div><span>{start} — {finish}</span></div>
 {!validRange&&<p role="alert">Choose a valid date range of at most one year. Showing the saved schedule dates.</p>}
 <div className={styles.legend} aria-label="Stage color key">{Object.entries(TEAM_STAGE_COLORS).map(([stage,color])=><span key={stage}><i style={{background:color}}/>{stage}</span>)}<span><b>OT</b> Overtime / weekend</span></div><p>Click a day on a timeline for people and hours. Bars connect non-working days; only scheduled days carry hours. OT marks extra shifts. The bottom border marks the project window; the red line marks today.</p>
 <details><summary>Schedule assumptions & coverage</summary><p>Production is paced toward Project Finish with one working day of buffer when feasible. Only entered projects are included; unimported work is not reflected in availability. Quoted hours and task dependencies determine each item's production windows. Staffing conflicts can relax pacing and are flagged.</p><p>CAD uses quoted hours at 8 hours per person per day, capped at 15% of project working time. Initial turnover includes CAD, purchasing and scope review within 20%. Production follows planned turnover completion; review readiness before starting. CAD staffing is assumed, not assigned to named people. Approved and fixed task windows stay unchanged.</p></details>
 <div className={styles.scroll} tabIndex={0} aria-label={`${group} timeline, scroll for dates and rows; dates and names stay fixed`}>
 <div className={styles.grid} role="table" aria-label={`${group} Gantt timeline`} style={{'--days':dates.length,'--day-width':'28px'} as CSSProperties}>
 <div role="row" className={styles.header}><div role="columnheader" className={styles.label}>{group} / assigned hours</div>{dates.map(date=>{const d=new Date(date+'T12:00:00Z');return <div role="columnheader" key={date} className={`${styles.date} ${d.getUTCDay()%6===0?styles.weekend:''} ${date===today?styles.today:''}`} title={date}><span>{d.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})}</span><strong>{d.getUTCDate()}</strong><small>{d.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small></div>;})}</div>
 {rows.map(row=>{const lanes=(allRows.get(row.id)??[]).filter(l=>l.start<=finish&&l.finish>=start);return <div role="row" className={styles.row} key={row.id}><div role="rowheader" className={styles.label}><strong>{row.name}</strong><small>{row.caption} · {n(row.hours)}h assigned</small>{row.finish&&<small>Project Finish: {row.finish}</small>}{row.unassigned>0&&<span className={styles.warning}>{n(row.unassigned)}h unassigned</span>}{row.futureHours>0&&<small>{n(row.futureHours)}h planned beyond view</small>}{!row.hours&&!row.preparation.length&&<small>No assigned work in this view</small>}</div>{dates.map(date=>{const weekend=new Date(date+'T12:00:00Z').getUTCDay()%6===0;return <div role="cell" key={date} className={`${styles.day} ${row.start&&row.finish&&date>=row.start&&date<=row.finish?styles.projectWindow:''} ${weekend?styles.weekend:''} ${date===today?styles.today:''}`}>
 {lanes.map(lane=>{if(date<lane.start||date>lane.finish)return <div key={lane.id} className={styles.slot}/>;
 const entries=lane.days.get(date)??[],planned=lane.preparation.flatMap(p=>p.daily.filter(d=>d.date===date)),hours=entries.reduce((sum,a)=>sum+a.hours,0)+planned.reduce((sum,d)=>sum+(d.hours??0),0),extra=entries.some(a=>a.workMode&&a.workMode!=='Regular'),first=date===lane.start||date===start,last=date===lane.finish||date===finish;
 return <button key={lane.id} className={`${styles.bar} ${first?styles.barStart:''} ${last?styles.barEnd:''}`} style={{'--bar-color':TEAM_STAGE_COLORS[lane.stage],'--span-days':dayNumber(lane.finish<finish?lane.finish:finish)-dayNumber(lane.start>start?lane.start:start)+1} as CSSProperties} aria-haspopup="dialog" aria-expanded={selected?.name===row.name&&selected.date===date&&selected.lane.id===lane.id} aria-label={`${row.name}, ${date}, ${lane.stage}, ${n(hours)} hours${extra?', overtime or weekend':''}, show details`} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();trigger.current=e.currentTarget;setSelected({name:row.name,date,lane,left:Math.max(12,Math.min(rect.left,window.innerWidth-372)),top:Math.max(12,Math.min(rect.bottom+8,window.innerHeight-330))});}}>{first?<span className={`${styles.stageLabel} ${dayNumber(finish)-dayNumber(date)<6&&dayNumber(date)-dayNumber(start)>=6?styles.labelEnd:''}`}>{lane.stage}</span>:null}{extra&&<b className={styles.ot}>OT</b>}</button>;
 })}</div>;})}</div>;})}


 </div>{!rows.length&&<p>No matching work in this view.</p>}</div>
 {group==='Person'&&<p>CAD and turnover blocks are planning windows without named assignees. Unassigned hours cannot be attributed to a person. Review them in Project/Trade view or the unassigned-work list.</p>}
 {selected&&createPortal(<div ref={bubble} tabIndex={-1} role="dialog" aria-label={`${selected.lane.stage} day details`} className={styles.bubble} style={{left:selected.left,top:selected.top}}><div className={styles.bubbleHeader}><div><small>{selected.date}</small><h3>{selected.lane.stage}</h3></div><button onClick={close} aria-label="Close schedule details">×</button></div><p className={styles.bubbleProject}>{selected.lane.project}</p>
 {selected.lane.preparation.map(p=>{const daily=p.daily.find(d=>d.date===selected.date);return <div key={p.kind}><p>{!daily?'No work scheduled on this day.':p.hours===null?'Turnover planning window — no additional labor hours.':`${n(daily.hours??0)} quoted CAD hours · people not yet assigned.`}</p><small>{p.staffingNote}</small></div>;})}
 {!selected.lane.preparation.length&&(!(selected.lane.days.get(selected.date)?.length)?<p>No work scheduled on this day. The bar connects this trade’s timeline.</p>:<><p className={styles.dailyTotal}>{n((selected.lane.days.get(selected.date)??[]).reduce((sum,a)=>sum+a.hours,0))} hours scheduled</p><ul>{selected.lane.days.get(selected.date)!.map((a,i)=><li key={i}><div><strong>{a.person}</strong><b>{n(a.hours)}h</b></div><small>{a.trade} · {a.item} · {a.workMode??'Regular'}{a.secondary?' · Secondary skill':''}</small></li>)}</ul></>)}
 </div>,document.body)}
 </section>;
}
