'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {adaFetch} from '@/lib/ada-client';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {invalidateQuoteLibrary} from '@/lib/quote-library-client';
import {createVisibleRefresh} from '@/lib/visible-refresh';
import {capacityProject,dateString,dayNumber,type CapacityQuote} from '@/lib/capacity';
import {WEEKDAYS,type ProductionCalendar} from '@/lib/production-calendar';
import {projectTimeline,stageLabor} from '@/lib/project-timeline';
import styles from './project-capacity.module.css';

type Project=CapacityQuote&{client:string;version:number;canEdit:boolean};
const number=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:2});
const date=(value:string)=>value?new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Not set';

export function ProjectCapacity({workspaceId}:{workspaceId:string}){
  const [source,setSource]=useState<Project|null>(null),[calendar,setCalendar]=useState<ProductionCalendar>({...WEEKDAYS}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  const saved=source?.document?.productionCalendar??WEEKDAYS;
  const dirty=calendar.saturday!==saved.saturday||calendar.sunday!==saved.sunday;
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  const savingRef=useRef(false);
  const refresh=useRef<ReturnType<typeof createVisibleRefresh<Project>>|null>(null);
  const read=useCallback(async()=>{
    const response=await adaFetch(`/api/quote-workspaces/${workspaceId}/capacity`),payload=await response.json();
    if(!response.ok)throw new Error(payload.error||'Project capacity could not load.');
    return {workspaceId,workspace:payload.workspace,client:payload.client??'',version:payload.version,canEdit:payload.canEdit,document:payload.document?parseQuoteV27(payload.document):null};
  },[workspaceId]);
  useEffect(()=>{
    setSource(null);setError('');setCalendar({...WEEKDAYS});dirtyRef.current=false;
    const controller=createVisibleRefresh(read,data=>{setSource(data);setCalendar({...data.document?.productionCalendar??WEEKDAYS});setError('');},e=>{setSource(null);setError(e instanceof Error?e.message:'Project capacity could not load.');},()=>document.visibilityState==='visible'&&!dirtyRef.current&&!savingRef.current);
    refresh.current=controller;
    const visibility=()=>{if(document.visibilityState==='hidden')controller.pause();else void controller.request(true);};
    const changed=()=>{void controller.request(true);};
    const identity=()=>{setSource(null);setCalendar({...WEEKDAYS});dirtyRef.current=false;controller.pause();void controller.request(true);};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('quote-workbook-saved',changed);window.addEventListener('quote-library-identity-changed',identity);
    const timer=window.setInterval(()=>void controller.request(),60000);void controller.request();
    return()=>{controller.dispose();refresh.current=null;window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('quote-workbook-saved',changed);window.removeEventListener('quote-library-identity-changed',identity);};
  },[read]);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  async function save(){
    if(!source?.document||!source.canEdit||savingRef.current)return;
    savingRef.current=true;setSaving(true);setError('');setNotice('');
    try{
      const updated=parseQuoteV27({...source.document,productionCalendar:calendar});
      const response=await adaFetch(`/api/quote-workspaces/${workspaceId}/workbook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:source.version,document:updated})}),payload=await response.json();
      if(!response.ok)throw new Error(payload.error||'Weekend choices could not save.');
      setSource({...source,document:updated,version:payload.version});dirtyRef.current=false;setNotice('Project workweek saved. The overall Capacity page now uses these weekend choices.');invalidateQuoteLibrary();
    }catch(e){setError(e instanceof Error?e.message:'Save failed. Your weekend choices are still here.');}
    finally{savingRef.current=false;setSaving(false);}
  }
  const project=useMemo(()=>source?capacityProject(source):null,[source]);
  const timeline=project?projectTimeline(project.schedule,calendar):null;
  const labor=project?stageLabor(project):null;
  function discard(){setCalendar({...saved});dirtyRef.current=false;void refresh.current?.request(true);setNotice('');}
  return <main className={styles.page} onClickCapture={event=>{if(dirty&&(event.target as HTMLElement).closest('a')&&!window.confirm('Leave without saving the project weekend choices?')){event.preventDefault();event.stopPropagation();}}}>
    <header className={styles.header}><div><p className={styles.eyebrow}>PROJECT CAPACITY</p><h1>{source?.workspace??'Project capacity'}</h1><p>{source?.client||'Saved quote production plan'}{source?` · Quote revision ${source.version}`:''}</p></div><nav><Link href="/capacity">All projects</Link><Link href={`/quotes/${workspaceId}`}>Open quote / edit dates</Link><button disabled={saving||dirty} onClick={()=>void refresh.current?.request(true)}>Refresh</button></nav></header>
    {error?<p role="alert" className={styles.warning}>{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {!source&&!error?<p role="status">Loading project…</p>:null}
    {source&&!source.document?<p className={styles.warning}>Save this quote’s workbook and enter its build dates to create the project timeline.</p>:null}
    {project&&source?.document&&timeline&&labor?<>
      <section className={styles.cards} aria-label="Project dates and capacity">
        {[['Build start',date(project.schedule.buildStart)],['Build finish',date(project.schedule.buildFinish)],['Install',date(project.schedule.installDate)],['Shop hours',number(project.shop)],['Field hours',number(project.field)],['Design hours',number(project.demand.design)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <section className={styles.panel} aria-label="Project workweek"><h2>Project workweek</h2><div className={styles.controls}>
        <span>Monday–Friday</span><label><input type="checkbox" checked={calendar.saturday} disabled={!source.canEdit||saving} onChange={e=>setCalendar({...calendar,saturday:e.target.checked})}/> Saturday work necessary</label><label><input type="checkbox" checked={calendar.sunday} disabled={!source.canEdit||saving} onChange={e=>setCalendar({...calendar,sunday:e.target.checked})}/> Sunday work necessary</label>
        <button disabled={!source.canEdit||!dirty||saving} onClick={()=>void save()}>{saving?'Saving…':'Save workweek'}</button>{dirty?<button disabled={saving} onClick={discard}>Discard changes / reload</button>:null}
      </div><p>{dirty?'Unsaved preview. Save to update the overall Capacity page.':'Weekend choices apply only to this project.'} Build and install dates stay fixed; stage boundaries and shop-hour distribution adjust to the enabled days. Holidays are not excluded automatically.</p>{!source.canEdit?<p>This quote is read-only; workweek changes require quote editing access.</p>:null}</section>
      <section className={styles.panel} aria-label="Default production timeline"><h2>Default production timeline</h2><p>{timeline.workdays} working days · Six sequential stages · Percentages describe elapsed working time, not shares of labor hours.</p>
        {timeline.warnings.map(w=><p className={styles.warning} key={w}>{w}</p>)}
        {timeline.workdays>0?<ProductionTimeline timeline={timeline} install={project.schedule.installDate}/>:null}
        <div className={styles.tableScroll}><table><caption>Stage targets and labor detail</caption><thead><tr><th>Stage</th><th>Timeline share</th><th>Working days</th><th>Start</th><th>Finish / milestone</th><th>Labor hours</th></tr></thead><tbody>{timeline.stages.map(stage=><tr key={stage.id}><th><span className={styles.dot} style={{background:stage.color}}/>{stage.name}</th><td>{stage.percent}%</td><td>{number(stage.workdays)}</td><td>{date(stage.start)}</td><td>{date(stage.finish)}<small>{stage.milestone}</small></td><td>{labor.hours[stage.id]===undefined?'Not separately attributed':number(labor.hours[stage.id])}</td></tr>)}</tbody></table></div>
        <p>Milestones are planning targets, not recorded completion. Fractional days may place consecutive stages on the same date. Labor comes from quoted design hours and named shop trades (including saved remaining-hour overrides); it is never redistributed using the timeline percentages.</p>
      </section>
      <section className={styles.details}><div className={styles.panel}><h2>Project planning detail</h2><p>Forecast: <strong>{project.status||'Not set'}</strong> · {number(project.probability*100)}% probability</p><p>Quoted shop baseline: {number(project.demand.shop)} hours · Current planning shop hours: {number(project.shop)}</p>{project.document?.planning?.notes?<p>{project.document.planning.notes}</p>:null}{project.flags.map(flag=><p className={styles.warning} key={flag}>{flag}</p>)}<p>Field work remains tied to the install estimate. Weekend choices control the production/build calendar; they do not add staff capacity or change quoted hours.</p></div><div className={styles.panel}><h2>Trade hours outside these stages</h2>{Object.keys(labor.other).length?<ul>{Object.entries(labor.other).map(([name,hours])=><li key={name}>{name}: <strong>{number(hours)} hours</strong></li>)}</ul>:<p>No remaining shop trade hours outside the mapped stages.</p>}<p>Unrecognized trades and untyped hours remain here for review rather than being assigned to an arbitrary stage.</p></div></section>
    </>:null}
  </main>;
}

export function ProductionTimeline({timeline,install}:{timeline:ReturnType<typeof projectTimeline>;install:string}){
  const span=timeline.axisEnd-timeline.axisStart;
  const position=(day:number)=>(day-timeline.axisStart)/span*100;
  const ticks=Array.from(new Set(Array.from({length:5},(_,i)=>Math.round(timeline.axisStart+(span-1)*i/4))));
  return <div className={styles.timeline} aria-label="Dated project timeline">
    <div className={styles.axis}><span>Stage / milestone</span><div>{ticks.map((day,i)=><span key={day} style={{left:`${position(day)}%`,transform:i===0?'none':i===ticks.length-1?'translateX(-100%)':'translateX(-50%)'}}>{dateString(day).slice(5)}</span>)}</div></div>
    {timeline.stages.map(stage=><div className={styles.trackRow} key={stage.id}><div><strong>{stage.name}</strong><small>{stage.percent}% · {date(stage.start)} – {date(stage.finish)}</small></div><div className={styles.track}><div className={styles.bar} style={{left:`${position(stage.from)}%`,width:`${Math.max(.35,(stage.to-stage.from)/span*100)}%`,background:stage.color}} title={`${stage.name}: ${stage.start} to ${stage.finish}`}/><span className={styles.flag} style={{left:`${position(stage.to)}%`}} title={`${stage.milestone}: ${stage.finish}`}>◆</span><span className={styles.milestone}>{stage.milestone}</span></div></div>)}
    {install?<div className={styles.trackRow}><div><strong>Install</strong><small>{date(install)} · separate milestone</small></div><div className={styles.track}><span className={styles.installFlag} style={{left:`${position(dayNumber(install)+.5)}%`}}>◆</span><span className={styles.milestone}>Installation</span></div></div>:null}
  </div>;
}
