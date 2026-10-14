'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {adaFetch} from '@/lib/ada-client';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {invalidateQuoteLibrary} from '@/lib/quote-library-client';
import {createVisibleRefresh} from '@/lib/visible-refresh';
import {capacityProject,type CapacityQuote} from '@/lib/capacity';
import {WEEKDAYS,type ProductionCalendar} from '@/lib/production-calendar';
import {projectTimeline} from '@/lib/project-timeline';
import {emptyProgress,setCompletionDate,type ProductionProgress,type StageId} from '@/lib/production-progress';
import {itemTimelines,quotedStageHours,isBuildTimelineItem} from '@/lib/item-timeline';
import {ProductionTimeline,StageTable,ItemStageRows} from './production-timeline';
import styles from './project-capacity.module.css';
import {WorkbackSchedule} from './workback-schedule';
import {ProductionPlanner} from './production-planner';

type Project=CapacityQuote&{client:string;version:number;canEdit:boolean};
const number=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:2});
const date=(value:string)=>value?new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Not set';

export function ProjectCapacity({workspaceId}:{workspaceId:string}){
  const [source,setSource]=useState<Project|null>(null),[calendar,setCalendar]=useState<ProductionCalendar>({...WEEKDAYS}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  const [progress,setProgress]=useState<ProductionProgress>(emptyProgress),[selectedItem,setSelectedItem]=useState('');
  const saved=source?.document?.productionCalendar??WEEKDAYS;
  const dirty=calendar.saturday!==saved.saturday||calendar.sunday!==saved.sunday||JSON.stringify(progress)!==JSON.stringify(source?.document?.productionProgress??emptyProgress());
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  const savingRef=useRef(false);
  const refresh=useRef<ReturnType<typeof createVisibleRefresh<Project>>|null>(null);
  const read=useCallback(async()=>{
    const response=await adaFetch(`/api/quote-workspaces/${workspaceId}/capacity`),payload=await response.json();
    if(!response.ok)throw new Error(payload.error||'Project capacity could not load.');
    return {workspaceId,workspace:payload.workspace,client:payload.client??'',version:payload.version,canEdit:payload.canEdit,document:payload.document?parseQuoteV27(payload.document):null};
  },[workspaceId]);
  useEffect(()=>{
    setSource(null);setError('');setProgress(emptyProgress());setSelectedItem('');setCalendar({...WEEKDAYS});dirtyRef.current=false;
    const controller=createVisibleRefresh(read,data=>{setSource(data);setProgress(data.document?.productionProgress??emptyProgress());setCalendar({...data.document?.productionCalendar??WEEKDAYS});setError('');},e=>{setSource(null);setError(e instanceof Error?e.message:'Project capacity could not load.');},()=>document.visibilityState==='visible'&&!dirtyRef.current&&!savingRef.current);
    refresh.current=controller;
    const visibility=()=>{if(document.visibilityState==='hidden')controller.pause();else void controller.request(true);};
    const changed=()=>{void controller.request(true);};
    const identity=()=>{setSource(null);setProgress(emptyProgress());setSelectedItem('');setCalendar({...WEEKDAYS});dirtyRef.current=false;controller.pause();void controller.request(true);};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('quote-workbook-saved',changed);window.addEventListener('quote-library-identity-changed',identity);
    const timer=window.setInterval(()=>void controller.request(),60000);void controller.request();
    return()=>{controller.dispose();refresh.current=null;window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('quote-workbook-saved',changed);window.removeEventListener('quote-library-identity-changed',identity);};
  },[read]);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  async function save(){
    if(!source?.document||!source.canEdit||savingRef.current)return;
    savingRef.current=true;setSaving(true);setError('');setNotice('');
    try{
      const updated=parseQuoteV27({...source.document,productionCalendar:calendar,productionProgress:progress});
      const response=await adaFetch(`/api/quote-workspaces/${workspaceId}/workbook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:source.version,document:updated})}),payload=await response.json();
      if(!response.ok)throw new Error(payload.error||'Capacity changes could not save.');
      setSource({...source,document:updated,version:payload.version});dirtyRef.current=false;setNotice('Capacity changes saved. Completion dates and weekend choices are available to your team.');invalidateQuoteLibrary();
    }catch(e){setError(e instanceof Error?e.message:'Save failed. Your capacity changes are still here.');}
    finally{savingRef.current=false;setSaving(false);}
  }
  const project=useMemo(()=>source?capacityProject(source):null,[source]);
  const timeline=project?projectTimeline(project.schedule,calendar):null;
  const allItems=useMemo(()=>source?.document?itemTimelines(source.document):[],[source]);
  const items=useMemo(()=>allItems.filter(isBuildTimelineItem),[allItems]);
  const hours=useMemo(()=>quotedStageHours(allItems),[allItems]);
  const selected=items.find(item=>item.id===selectedItem)??items[0];
  const actual=(stage:StageId,value:string,itemId?:string)=>{setProgress(p=>setCompletionDate(p,stage,value,itemId));setNotice('');};
  function discard(){setProgress(source?.document?.productionProgress??emptyProgress());setCalendar({...saved});dirtyRef.current=false;void refresh.current?.request(true);setNotice('');}
  return <main className={styles.page} onClickCapture={event=>{if(dirty&&(event.target as HTMLElement).closest('a')&&!window.confirm('Leave without saving the capacity changes?')){event.preventDefault();event.stopPropagation();}}}>
    <header className={styles.header}><div><p className={styles.eyebrow}>PROJECT CAPACITY</p><h1>{source?.workspace??'Project capacity'}</h1><p>{source?.client||'Saved quote production plan'}{source?` · Quote revision ${source.version}`:''}</p></div><nav><Link href="/capacity">All projects</Link><Link href={`/quotes/${workspaceId}`}>Open quote / edit dates</Link><button disabled={saving||dirty} onClick={()=>void refresh.current?.request(true)}>Refresh</button></nav></header>
    {error?<p role="alert" className={styles.warning}>{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {!source&&!error?<p role="status">Loading project…</p>:null}
    {source&&!source.document?<p className={styles.warning}>Save this quote’s workbook and enter its build dates to create the project timeline.</p>:null}
    {project&&source?.document&&timeline?<>
      <section className={styles.cards} aria-label="Project dates and capacity">
        {[['Build start',date(project.schedule.buildStart)],['Build finish',date(project.schedule.buildFinish)],['Install',date(project.schedule.installDate)],['Shop hours',number(project.shop)],['Field hours',number(project.field)],['Design hours',number(project.demand.design)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <details><summary>Workback Schedule — overview, internal milestones and client PDF</summary><WorkbackSchedule workspaceId={workspaceId} quoteVersion={source.version}/></details><ProductionPlanner workspaceId={workspaceId} quote={source.document} quoteVersion={source.version}/>
      <details className={styles.panel}><summary>Percentage reference and earlier completion records</summary><p>These retained records use the original fixed stage percentages. Use the production schedule above for current operational planning and actuals.</p>
      <section className={styles.panel} aria-label="Project workweek"><h2>Project workweek</h2><div className={styles.controls}>
        <span>Monday–Friday</span><label><input type="checkbox" checked={calendar.saturday} disabled={!source.canEdit||saving} onChange={e=>setCalendar({...calendar,saturday:e.target.checked})}/> Saturday work necessary</label><label><input type="checkbox" checked={calendar.sunday} disabled={!source.canEdit||saving} onChange={e=>setCalendar({...calendar,sunday:e.target.checked})}/> Sunday work necessary</label>
        <button disabled={!source.canEdit||!dirty||saving} onClick={()=>void save()}>{saving?'Saving…':'Save capacity changes'}</button>{dirty?<button disabled={saving} onClick={discard}>Discard changes / reload</button>:null}
      </div><p>{dirty?'Unsaved changes. Save to share completion dates and update Capacity.':'Weekend choices apply only to this project.'} Build and install dates stay fixed; stage boundaries and shop-hour distribution adjust to the enabled days. Holidays are not excluded automatically.</p>{!source.canEdit?<p>This quote is read-only; capacity changes require quote editing access.</p>:null}</section>
      <section className={styles.panel} aria-label="Default production timeline"><h2>Percentage reference timeline</h2><p>{timeline.workdays} working days · Sequential production stages · Percentages describe elapsed working time, not shares of labor hours.</p>
        {timeline.warnings.map(w=><p className={styles.warning} key={w}>{w}</p>)}
        {timeline.workdays>0?<ProductionTimeline timeline={timeline} install={project.schedule.installDate} hours={hours} actual={progress.stages} renderStage={stage=><ItemStageRows items={items} stage={stage} progress={progress} hoursPerDay={source.document!.settings.shopDay} disabled={!source.canEdit||saving} onActual={actual} onSelect={id=>{setSelectedItem(id);document.getElementById('item-timeline')?.scrollIntoView({behavior:'smooth'});}}/>}/>:null}
        <StageTable timeline={timeline} hours={hours} actual={progress.stages} hoursPerDay={source.document.settings.shopDay} disabled={!source.canEdit||saving} onActual={(stage,value)=>actual(stage,value)} label="Project"/>
        <p>Click a stage to expand its build items. Working days describe the stage window; quoted hours describe labor effort. Person-days use this quote’s {number(source.document.settings.shopDay)}-hour shop day. Item schedules run in parallel within those windows. Actual dates are manually reported completion, independent of targets and quoted hours.</p>
      </section>
      <section id="item-timeline" className={styles.panel} aria-label="Item timeline"><h2>Item timeline</h2>
        <label className={styles.itemPicker}>Choose build item <select aria-label="Choose build item" value={selected?.id??''} onChange={e=>setSelectedItem(e.target.value)}>{items.map(item=><option key={item.id} value={item.id}>Item {item.number} — {item.name}</option>)}</select></label>
        {selected?<><h3>Item {selected.number} — {selected.name}</h3><p>{selected.type} · {number(selected.hours)} quoted allowed hours. Shared design hours remain on the quoted CAD line; they are not duplicated across build items.</p>
          {timeline.workdays>0?<ProductionTimeline timeline={timeline} install="" hours={selected.stages} actual={progress.items[selected.id]??{}}/>:null}
          <StageTable timeline={timeline} hours={selected.stages} actual={progress.items[selected.id]??{}} hoursPerDay={source.document.settings.shopDay} disabled={!source.canEdit||saving} onActual={(stage,value)=>actual(stage,value,selected.id)} label={`Item ${selected.number} — ${selected.name}`}/>
          <p>Stage dates follow the overall project. A dash means no labor is attributed to this stage in the quote, not that the work is complete.</p>
          {Object.entries(selected.trades).length?<p>Quoted trade detail: {Object.entries(selected.trades).map(([name,value])=>`${name}: ${number(value)} h`).join(' · ')}</p>:null}
          {selected.untyped>0?<p className={styles.warning}>{number(selected.untyped)} allowed hours are not attributed to a production stage. These may be field/service hours or unassigned shop labor.</p>:null}
          {Object.entries(selected.other).map(([name,value])=><p key={name}>{name}: {number(value)} h — no default stage assignment.</p>)}
          {selected.overallocated>0?<p className={styles.warning}>Trade detail exceeds allowed hours by {number(selected.overallocated)} h. Review quote overrides; hours have not been silently rescaled.</p>:null}
        </>:<p>No build items yet. Add materials or labor to the quote to populate item timelines.</p>}

      </section>
      </details>
      <section className={styles.details}><div className={styles.panel}><h2>Project planning detail</h2><p>Forecast: <strong>{project.status||'Not set'}</strong> · {number(project.probability*100)}% probability</p><p>Quoted shop baseline: {number(project.demand.shop)} hours · Current planning shop hours: {number(project.shop)}</p>{project.document?.planning?.notes?<p>{project.document.planning.notes}</p>:null}{project.flags.map(flag=><p className={styles.warning} key={flag}>{flag}</p>)}<p>Field work remains tied to the install estimate. Weekend choices control the production/build calendar; they do not add staff capacity or change quoted hours.</p></div><div className={styles.panel}><h2>Quoted hours and completion</h2><p>Stage and item tables use the saved quote’s labor estimates. Remaining-hour planning overrides stay separate and do not rewrite the quoted item breakdown.</p><p>Project-stage completion is entered separately from item completion; finishing one item does not mark the entire stage complete. Your team can edit Actual dates with its existing quote editing access.</p></div></section>
      {dirty?<div className={styles.saveBar} role="status"><span>Unsaved capacity changes</span><button disabled={saving||!source.canEdit} onClick={()=>void save()}>{saving?'Saving…':'Save capacity changes'}</button><button disabled={saving} onClick={discard}>Discard changes / reload</button></div>:null}
    </>:null}
  </main>;
}
