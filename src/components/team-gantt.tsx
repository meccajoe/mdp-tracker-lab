'use client';
import {useEffect,useMemo,useState,type CSSProperties} from 'react';
import {dateString,dayNumber} from '@/lib/capacity';
import {teamGanttRows,type GanttGroup,type GanttResult} from '@/lib/team-gantt';
import type {TeamAllocation} from '@/lib/team-schedule';
import styles from './team-gantt.module.css';
const n=(v:number)=>v.toLocaleString(undefined,{maximumFractionDigits:1});
const colors=['#28799c','#5e6fba','#348379','#976784','#93702e','#557c4c'];
export function TeamGantt({result,filter}:{result:GanttResult;filter:{project:string;person:string;trade:string}}){
 const [group,setGroup]=useState<GanttGroup>('Project'),[wide,setWide]=useState(false),[selected,setSelected]=useState<{name:string;date:string;entries:TeamAllocation[]}|null>(null);
 useEffect(()=>setSelected(null),[result,filter.project,filter.person,filter.trade]);
 const rows=useMemo(()=>teamGanttRows(result,group,filter),[result,group,filter.project,filter.person,filter.trade]);
 const dates=useMemo(()=>Array.from({length:dayNumber(result.options.finish)-dayNumber(result.options.start)+1},(_,i)=>dateString(dayNumber(result.options.start)+i)),[result.options.start,result.options.finish]);
 const today=new Date().toLocaleDateString('en-CA');
 return <section className={styles.chart} aria-label="Team schedule Gantt chart">
 <div className={styles.controls}><div role="group" aria-label="Group timeline by">{(['Project','Trade','Person'] as const).map(value=><button key={value} aria-pressed={group===value} onClick={()=>{setGroup(value);setSelected(null);}}>{value}</button>)}</div><label><input type="checkbox" checked={wide} onChange={e=>setWide(e.target.checked)}/> Larger days</label><span>{result.options.start} — {result.options.finish}</span></div>
 <p>Bars show assigned hours on each date. Shaded columns are weekends; the red line marks today. Click a bar for items, people and trades. Projects without assignments stay visible.</p>
 <div className={styles.scroll} tabIndex={0} aria-label={`${group} timeline, scroll horizontally for dates`}>
 <div className={styles.grid} role="table" aria-label={`${group} Gantt timeline`} style={{'--days':dates.length,'--day-width':wide?'48px':'28px'} as CSSProperties}>
 <div role="row" className={styles.header}><div role="columnheader" className={styles.label}>{group} / assigned hours</div>{dates.map(date=>{const d=new Date(date+'T12:00:00Z');return <div role="columnheader" key={date} className={`${styles.date} ${d.getUTCDay()%6===0?styles.weekend:''} ${date===today?styles.today:''}`} title={date}><span>{d.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})}</span><strong>{d.getUTCDate()}</strong><small>{d.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small></div>;})}</div>
 {rows.map((row,index)=><div role="row" className={styles.row} key={row.id}><div role="rowheader" className={styles.label}><strong>{row.name}</strong><small>{row.caption} · {n(row.hours)}h assigned</small>{row.unassigned>0&&<span className={styles.warning}>{n(row.unassigned)}h unassigned</span>}{!row.hours&&<small>No assigned work in this view</small>}</div>{dates.map(date=>{const entries=row.days.get(date)??[],hours=entries.reduce((s,a)=>s+a.hours,0),weekend=new Date(date+'T12:00:00Z').getUTCDay()%6===0;return <div role="cell" key={date} className={`${styles.day} ${weekend?styles.weekend:''} ${date===today?styles.today:''}`}>{hours>0&&<button className={styles.bar} style={{'--bar-color':colors[index%colors.length]} as CSSProperties} title={`${row.name} · ${date} · ${n(hours)} hours\n${entries.map(a=>`${a.person}: ${a.project} / ${a.item} / ${a.trade} (${n(a.hours)}h)`).join('\n')}`} aria-label={`${row.name}, ${date}, ${n(hours)} hours, show assignments`} onClick={()=>setSelected({name:row.name,date,entries})}>{n(hours)}</button>}</div>;})}</div>)}
 </div>{!rows.length&&<p>No matching work in this view.</p>}</div>
 {group==='Person'&&<p>Unassigned hours cannot be attributed to a person. Review them in Project/Trade view or the unassigned-work list.</p>}
 {selected&&<section className={styles.detail} aria-label="Selected day assignments"><div className={styles.controls}><h3>{selected.name} · {selected.date}</h3><button onClick={()=>setSelected(null)}>Close details</button></div><ul>{selected.entries.map((a,i)=><li key={i}><strong>{a.person} · {n(a.hours)}h</strong> — {a.project} / {a.item} / {a.trade}{a.secondary?' (secondary skill)':''}</li>)}</ul></section>}
 </section>;
}
