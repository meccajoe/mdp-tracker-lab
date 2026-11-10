'use client';
import {confirmAction,confirmLinkNavigation} from './confirm-action';
import {QuoteLibrary} from './quote-library';
import {forecastLabel} from '@/lib/quote-schedule';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Button} from './ui/button';
import {capacityTrade} from '@/lib/capacity-trades';
import {adaFetch} from '@/lib/ada-client';
import {parseQuoteV27} from '@/lib/quote-v27-validation';
import {loadSavedQuotes,invalidateQuoteLibrary} from '@/lib/quote-library-client';
import {createVisibleRefresh} from '@/lib/visible-refresh';
import {FORECAST_STATUSES} from '@/lib/quote-schedule';
import {capacityProject,emptyCapacity,emptyOverride,monday,parseCapacity,SHOP_TRADES,type CapacityDocument,type CapacityOverride,type CapacityQuote} from '@/lib/capacity';
import styles from './capacity-tracker.module.css';
import {CapacityPlanning} from './capacity-planning';
import {CapacityDashboard} from './capacity-dashboard';
import type {ProductionPlan} from '@/lib/production-plan';
import {WorkbackPolicyEditor} from './workback-policy';
import {defaultWorkbackPolicy} from '@/lib/workback-model';
import {TeamSchedule} from './team-schedule';
import {CapacityRoster} from './capacity-roster';
type SavedQuote=CapacityQuote&{version:number;canEdit:boolean};
function Entry({label,value,onChange,nullable=false}:{label:string;value:number|null;onChange:(value:number|null)=>void;nullable?:boolean}){return <input aria-label={label} type="number" min="0" step="any" key={value??'auto'} defaultValue={value??''} placeholder={nullable?'Quoted':''} onBlur={event=>{const next=event.target.value===''&&nullable?null:Number(event.target.value);if(next!==value)onChange(next);}} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>;}
export function CapacityTracker(){
 const [tab,setTab]=useState('Dashboard'),[quotes,setQuotes]=useState<SavedQuote[]>([]),[document,setDocument]=useState<CapacityDocument>(emptyCapacity),[version,setVersion]=useState(0),[canEdit,setCanEdit]=useState(false),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[settingsError,setSettingsError]=useState(''),[scenario,setScenario]=useState<string[]>([]),[editing,setEditing]=useState<string|null>(null),[plan,setPlan]=useState<CapacityOverride>(emptyOverride);
 const [visited,setVisited]=useState(()=>new Set(['Dashboard']));
 const [activations,setActivations]=useState<Record<string,string>>({});
 const [productionPlans,setProductionPlans]=useState<Record<string,ProductionPlan>>({}),[planError,setPlanError]=useState('');
 useEffect(()=>{let active=true,generation=0;const read=async()=>{const current=++generation;try{const r=await adaFetch('/api/capacity/production-plans'),p=await r.json();if(active&&current===generation){setProductionPlans(p.plans??{});setActivations(p.activations??{});setPlanError(r.ok?'':p.error);}}catch{if(active&&current===generation){setProductionPlans({});setActivations({});setPlanError('Saved schedules unavailable; automatic proposals shown.');}}};const identity=()=>{setProductionPlans({});setActivations({});void read();};void read();window.addEventListener('production-plan-saved',read);window.addEventListener('capacity-schedules-refresh',read);window.addEventListener('quote-library-identity-changed',identity);const timer=setInterval(()=>{if(window.document.visibilityState==='visible')void read();},60000);return()=>{active=false;clearInterval(timer);window.removeEventListener('production-plan-saved',read);window.removeEventListener('capacity-schedules-refresh',read);window.removeEventListener('quote-library-identity-changed',identity);};},[]);
 const editingRef=useRef(editing);editingRef.current=editing;
 const refreshRef=useRef<ReturnType<typeof createVisibleRefresh<Awaited<ReturnType<typeof loadSavedQuotes>>>>|null>(null);
 const loadQuotes=useCallback(async()=>{window.dispatchEvent(new Event('capacity-schedules-refresh'));await refreshRef.current?.request(true);},[]);
 const loadSettings=useCallback(async()=>{const response=await adaFetch('/api/capacity/settings'),payload=await response.json();setSettingsError(response.ok?'':payload.error||'Settings unavailable.');if(payload.document){setDocument(parseCapacity(payload.document));setVersion(payload.version);setCanEdit(Boolean(payload.canEdit));setDirty(false);}},[]);
 useEffect(()=>{
  let mounted=true;
  const controller=createVisibleRefresh(()=>loadSavedQuotes(),result=>{
   setQuotes(result.quotes);setError('');
   setNotice(result.failures?`${result.failures} quotes could not load. Totals are incomplete — refresh before planning.`:'');
  },error=>{setQuotes([]);setNotice('Totals are unavailable — refresh before planning.');setError(error instanceof Error?error.message:'Quotes could not load.');},()=>window.document.visibilityState==='visible'&&!editingRef.current);
  refreshRef.current=controller;
  const visibility=()=>{if(window.document.visibilityState==='hidden')controller.pause();else void controller.request(true);};
  const saved=()=>{void controller.request(true);};
  const identity=()=>{setQuotes([]);setScenario([]);setEditing(null);setPlan(emptyOverride());editingRef.current=null;controller.pause();void controller.request(true);};
  window.document.addEventListener('visibilitychange',visibility);
  window.addEventListener('quote-workbook-saved',saved);
  window.addEventListener('quote-library-identity-changed',identity);
  const timer=window.setInterval(()=>{void controller.request();},60000);
  void controller.request();
  void loadSettings().catch(error=>{if(mounted)setError(error.message);});
  return()=>{mounted=false;controller.dispose();refreshRef.current=null;window.clearInterval(timer);window.document.removeEventListener('visibilitychange',visibility);window.removeEventListener('quote-workbook-saved',saved);window.removeEventListener('quote-library-identity-changed',identity);};
 },[loadSettings]);
 const previousEditing=useRef(editing);
 useEffect(()=>{if(previousEditing.current&&!editing)void refreshRef.current?.request(true);previousEditing.current=editing;},[editing]);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(editing)dialog.current?.showModal();},[editing]);
 useEffect(()=>{if(!dirty&&!editing)return;const navigate=(event:MouseEvent)=>{confirmLinkNavigation(event,'Leave without saving capacity changes?');};window.document.addEventListener('click',navigate,true);const leave=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',leave);return()=>{window.removeEventListener('beforeunload',leave);window.document.removeEventListener('click',navigate,true);};},[dirty,editing]);
 const projects=useMemo(()=>quotes.map(quote=>capacityProject({...quote,activationDate:activations[quote.workspaceId],productionPlan:productionPlans[quote.workspaceId]})),[quotes,productionPlans,activations]);
 const tradeNames=Array.from(new Set([...SHOP_TRADES,...document.settings.roster.flatMap(person=>[capacityTrade(person.primary),capacityTrade(person.secondary)]).filter(Boolean),...projects.flatMap(project=>Object.keys(project.trades))]));

 function change(fn:(next:CapacityDocument)=>void){const next=structuredClone(document);fn(next);setDocument(next);setDirty(true);}
 async function saveSettings(){setBusy(true);setError('');try{const parsed=parseCapacity(document);const response=await adaFetch('/api/capacity/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,document:parsed})}),payload=await response.json();if(!response.ok)throw new Error(payload.error);setVersion(payload.version);setDirty(false);setNotice('Capacity settings saved.');}catch(error){setError(error instanceof Error?error.message:'Save failed.');}finally{setBusy(false);}}
 async function savePlan(){const quote=quotes.find(quote=>quote.workspaceId===editing);if(!quote?.document)return;setBusy(true);setError('');try{const document=parseQuoteV27({...quote.document,planning:plan});const response=await adaFetch(`/api/quote-workspaces/${quote.workspaceId}/workbook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:quote.version,document})}),payload=await response.json();if(!response.ok)throw new Error(payload.error);previousEditing.current=null;editingRef.current=null;setEditing(null);invalidateQuoteLibrary();await refreshRef.current?.request();}catch(error){setError(error instanceof Error?error.message:'Plan could not save.');}finally{setBusy(false);}}

 return <main><div className={styles.page} style={tab==='Projects'?{minHeight:'auto'}:undefined}><header><div><h1>Capacity tracker</h1><p>Saved quote names, dates and hours flow here automatically. Updates refresh every 60 seconds.</p></div><Link href="/quotes">Open quotes</Link><Link href="/quotes/import">Import spreadsheet quotes</Link><Button variant="outline" onClick={()=>void loadQuotes().catch(error=>setError(error.message))}>Refresh quotes</Button></header>
 <nav role="tablist" aria-label="Capacity sections">{['Dashboard','Projects','Team Schedule','Capacity Planning','Field Load','Roster & Settings'].map(name=><button role="tab" aria-selected={tab===name} key={name} onClick={()=>{setVisited(current=>current.has(name)?current:new Set([...current,name]));setTab(name);}}>{name}</button>)}</nav>
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}{settingsError&&<p role="alert" className={styles.error}>{settingsError}</p>}
 {planError&&<div role="alert" className={styles.error}>{planError} <button type="button" onClick={()=>window.dispatchEvent(new Event('capacity-schedules-refresh'))}>Retry loading schedules</button></div>}
 {visited.has('Team Schedule')&&<div hidden={tab!=='Team Schedule'}><TeamSchedule active={tab==='Team Schedule'}/></div>}
 {visited.has('Dashboard')&&<div hidden={tab!=='Dashboard'}><CapacityDashboard projects={projects} settings={document.settings} settingsUnavailable={Boolean(settingsError)}/></div>}
 {visited.has('Field Load')&&<div hidden={tab!=='Field Load'}><CapacityDashboard mode="field" projects={projects} settings={document.settings} settingsUnavailable={Boolean(settingsError)}/></div>}
 {tab==='Roster & Settings'&&<><div className={styles.toolbar}><label>Week grid starts (Monday)<input aria-label="Week grid starts" type="date" value={document.settings.weekStart} disabled={!canEdit||busy} onChange={event=>{if(event.target.value)change(next=>{next.settings.weekStart=monday(event.target.value);});}}/></label><p>Production uses Monday–Friday by default. Set Saturday/Sunday work separately on each project’s capacity page.</p><label>Field hour distribution<select aria-label="Field hour distribution" disabled={!canEdit||busy} value={document.settings.fieldAllocation} onChange={event=>change(next=>{next.settings.fieldAllocation=event.target.value as 'install'|'build';})}><option value="install">Install date + estimated field days</option><option value="build">Build window (spreadsheet method)</option></select></label><button disabled={!canEdit||!dirty||busy} onClick={()=>void saveSettings()}>Save roster & settings</button><button disabled={busy} onClick={async ()=>{if(!dirty||await confirmAction('Discard unsaved roster changes?'))void loadSettings().catch(error=>setError(error.message));}}>Reload settings</button></div>
 <section aria-label="CAD capacity" className={styles.toolbar}><label>Total available CAD hours per week<input aria-label="Total available CAD hours per week" type="number" min="0" step="any" placeholder="Use CAD roster total" value={document.settings.cadHoursPerWeek??''} disabled={!canEdit||busy} onChange={event=>{const value=event.target.value;change(next=>{next.settings.cadHoursPerWeek=value===''?null:Number(value);});}}/></label><p>Total for the whole CAD team, spread across Monday–Friday. Replaces CAD roster capacity; leave blank to use the roster total. Enter 0 for no available CAD time. Save with “Save roster & settings” above.</p></section>
 <details><summary>Company workback defaults</summary><WorkbackPolicyEditor disabled={!canEdit||busy} value={document.settings.workback??defaultWorkbackPolicy()} onChange={policy=>change(next=>{next.settings.workback=policy;})}/></details>
 <CapacityRoster roster={document.settings.roster} disabled={!canEdit||busy} storageUnavailable={Boolean(settingsError)} onChange={roster=>change(next=>{next.settings.roster=roster;})}/></>}
 {tab==='Capacity Planning'&&<CapacityPlanning projects={projects} settings={document.settings} unavailable={Boolean(error||settingsError||planError||notice.includes('quotes could not load')||notice.includes('Totals are unavailable'))}/>}
 {editing&&<dialog ref={dialog} aria-label="Edit capacity plan" className={styles.dialog} onCancel={event=>{event.preventDefault();if(!busy)setEditing(null);}}><h2>{quotes.find(quote=>quote.workspaceId===editing)?.workspace} — capacity plan</h2><p>Overrides affect planning only. Clear a field to return to the quoted value.</p><fieldset disabled={busy}><label>Status override<select aria-label="Planning status override" value={plan.status} onChange={event=>setPlan({...plan,status:event.target.value as CapacityOverride['status']})}><option value="">From quote</option>{FORECAST_STATUSES.map(status=><option key={status} value={status}>{forecastLabel(status)}</option>)}</select></label><label>Remaining shop hours<Entry label="Remaining shop hours" value={plan.remainingShop} nullable onChange={value=>setPlan({...plan,remainingShop:value})}/></label><label>Remaining field hours<Entry label="Remaining field hours" value={plan.remainingField} nullable onChange={value=>setPlan({...plan,remainingField:value})}/></label><h3>Remaining hours by trade</h3>{tradeNames.map(trade=><label key={trade}>{trade}<Entry label={`Remaining ${trade}`} value={plan.remainingTrades[trade]??null} nullable onChange={value=>{const trades={...plan.remainingTrades};if(value===null)delete trades[trade];else trades[trade]=value;setPlan({...plan,remainingTrades:trades});}}/></label>)}<label>Notes<textarea aria-label="Planning notes" value={plan.notes} onChange={event=>setPlan({...plan,notes:event.target.value})}/></label><button onClick={()=>void savePlan()}>Save planning changes</button><button onClick={()=>setEditing(null)}>Cancel</button></fieldset></dialog>}
 </div>{tab==='Projects'&&<div className="px-[18px] pb-[18px]"><QuoteLibrary capacity={{projects,scenario,onScenarioChange:setScenario,onRefresh:loadQuotes}}/></div>}</main>;
}
