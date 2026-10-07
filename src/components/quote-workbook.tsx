"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {QuoteReusableToolbar} from './quote-reusable-items';
import {QuoteBOM,QuoteMaterialsDB} from './quote-reference-sheets';
import {EMPTY_SCHEDULE,FORECAST_STATUSES,parseSchedule} from '@/lib/quote-schedule';
import { QuoteEstimators } from '@/components/quote-estimators';
import { QuoteRates } from "@/components/quote-rates";
import { QuoteTakeoffs } from '@/components/quote-takeoffs';
import styles from './quote-workbook.module.css';
import {QuoteGridInteraction} from './quote-grid-interaction';
import { QuoteSheet } from '@/components/quote-sheet';
import { adaFetch } from '@/lib/ada-client';
import { calculateQuoteV27, EMPTY_INPUTS, LINE_TYPES, type Inputs, type QuoteV27 } from '@/lib/quote-v27';
import { quoteItemLabel } from '@/lib/quote-takeoff-grid';
import { newEditHistory, recordEdit, moveEditHistory, type EditHistory } from '@/lib/quote-edit-history';
import { parseQuoteV27 } from '@/lib/quote-v27-validation';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const number = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const control = 'rounded border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50';
const button = `${control} hover:bg-accent`;
const cell = 'p-2 text-left align-top';
type History = { revision: number; created_at: string; created_by_email: string };
const inputLabels: Record<keyof Inputs, string> = { materials:'Material cost', resale:'Resale cost', hours:'Labor hours', days:'Fabrication days', sqft:'Graphics sqft', panels:'beMatrix panels', rental:'Rental charge', siteDays:'Site / installer days', travelDays:'Travel days', cost:'Other cost / estimator billing' };


function Numeric({ label, value, onChange, nullable = false }: { label: string; value: number | null; onChange: (value: number | null) => void; nullable?: boolean }) {
  return <input aria-label={label} type="number" min="0" step="any" className={`${control} w-28 tabular-nums`} value={value ?? ''} placeholder={nullable ? 'Calculated' : '0'} onChange={event => onChange(event.target.value === '' ? (nullable ? null : 0) : Number(event.target.value))} />;
}

export function QuoteWorkbook({ workspaceId, quoteName, onDirtyChange, libraryItem=false }: { libraryItem?:boolean;quoteName?:string;workspaceId: string; onDirtyChange: (dirty: boolean) => void }) {
  const [document, setDocument] = useState<QuoteV27 | null>(null);
  const workbookRef=useRef<HTMLElement>(null);
  const [restoreKey,setRestoreKey]=useState(0);
  const edits = useRef<EditHistory<QuoteV27>|null>(null);
  const editGroup = useRef<object|null>(null);
  const savedDocument = useRef('');
  const [pendingInput,setPendingInput] = useState(false);
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<History[]>([]);
  const [dirty, setDirty] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(true);
  const [saving,setSaving]=useState(false);
  const saveInFlight=useRef(false);
  const autosavePaused=useRef(false);
  const autosave=useRef<()=>void>(()=>{});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectionSummary,setSelectionSummary]=useState('');
  const [tab, setTab] = useState('Quote Builder');
  const [selected, setSelected] = useState('');
  const endpoint = libraryItem?`/api/prequote-items/${workspaceId}`:`/api/quote-workspaces/${workspaceId}/workbook`;
  const load = useCallback(async (revision?: number) => {
    autosavePaused.current=false;setSelectionSummary('');setBusy(true); setError('');
    try {
      const response = await adaFetch(endpoint + (revision ? `?revision=${revision}` : ''));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Workbook could not load.');
      let next = payload.document ? parseQuoteV27(payload.document) : null;
      const initializing=!libraryItem&&!next&&payload.canEdit&&!revision;
      if(initializing){
        const templateResponse=await adaFetch(`${endpoint}?template=blank`);
        const template=await templateResponse.json();
        if(!templateResponse.ok)throw new Error(template.error||'Blank quote could not load.');
        next=parseQuoteV27(template.document);
      }
      edits.current = next?newEditHistory(next):null; editGroup.current=null; setDocument(next); setSelected(next?.lines[0]?.id ?? '');
      setVersion(payload.latestVersion); setHistory(payload.history); setCanEdit(payload.canEdit);
      const restoring = Boolean(revision && revision !== payload.latestVersion);
      savedDocument.current=restoring||initializing?'':JSON.stringify(next);setPendingInput(false);
      setDirty(restoring||initializing);
      setMessage(initializing?'New quote — ready to edit.':restoring ? `Revision ${revision} loaded. Save to keep it as a new revision.` : payload.version ? `Saved revision ${payload.version}` : 'No saved workbook yet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Workbook could not load.'); }
    finally { setBusy(false); }
  }, [endpoint,libraryItem]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const navigate = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]');
      if (a && !window.confirm('Leave this quote and discard unsaved edits?')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    window.document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); window.document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const result = useMemo(() => {
    if (!document) return { calculation: null, error: '' };
    try { if(document.schedule)parseSchedule(document.schedule);return { calculation: calculateQuoteV27(document), error: '' }; }
    catch (e) { return { calculation: null, error: e instanceof Error ? e.message : 'Check your inputs.' }; }
  }, [document]);
  const calculation = result.calculation;
  function edit(change: (next: QuoteV27) => void) {
    if (!canEdit || busy) return;
    if (!document) return;
    const current=edits.current??newEditHistory(document);
    const next = structuredClone(current.present); change(next);
    const updated=recordEdit(current,next,editGroup.current);
    if(updated===current)return;
    edits.current=updated; setDocument(next);setSelectionSummary('');
    setDirty(JSON.stringify(next)!==savedDocument.current); setMessage('Unsaved changes'); setError('');
  }
  function travelEdits(direction:'undo'|'redo') {
    if(!canEdit||busy)return;
    // Commit a cell being typed into before moving through workbook history.
    const focused=window.document.activeElement;
    if(focused instanceof HTMLElement)focused.blur();
    editGroup.current=null;setPendingInput(false);
    const current=edits.current;if(!current)return;
    const updated=moveEditHistory(current,direction);if(updated===current)return;
    edits.current=updated;setDocument(updated.present);setSelectionSummary('');setRestoreKey(key=>key+1);workbookRef.current?.focus({preventScroll:true});
    if(!updated.present.lines.some(line=>line.id===selected))setSelected(updated.present.lines[0]?.id??'');
    const changed=JSON.stringify(updated.present)!==savedDocument.current;
    setDirty(changed);setError('');setMessage(changed?`Unsaved changes · ${direction==='undo'?'edit undone':'edit redone'}`:`Saved revision ${version} · restored`);
  }
  async function save(automatic=false) {
    if(!canEdit||busy||saveInFlight.current)return;
    const focused=window.document.activeElement;
    if(focused instanceof HTMLInputElement && workbookRef.current?.contains(focused)) {
      const label=focused.getAttribute('aria-label'),start=focused.selectionStart,end=focused.selectionEnd,editing=focused.dataset.cellEditing;
      focused.blur();
      // A commit can replace the input. Restore its caret only if the user hasn't moved elsewhere.
      requestAnimationFrame(()=>{
        if(window.document.activeElement!==window.document.body&&window.document.activeElement!==focused)return;
        const replacement=label?Array.from(workbookRef.current?.querySelectorAll('input')??[]).find(input=>input.getAttribute('aria-label')===label):focused;
        if(!replacement?.isConnected||replacement.disabled)return;
        replacement.focus();if(editing!==undefined)replacement.dataset.cellEditing=editing;
        if(start!==null&&end!==null)replacement.setSelectionRange(start,end);
      });
    }
    const snapshot=edits.current?.present;if(!snapshot||JSON.stringify(snapshot)===savedDocument.current)return;
    try {parseQuoteV27(snapshot);calculateQuoteV27(snapshot);}catch{setError('Fix invalid inputs before saving.');return;}
    saveInFlight.current=true;setSaving(true);setError('');
    try {
      const response=await adaFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,document:snapshot})});
      const payload=await response.json();
      if(!response.ok){if(response.status===409)autosavePaused.current=true;throw new Error(payload.error||'Save failed. Your edits are still here.');}
      savedDocument.current=JSON.stringify(snapshot);setVersion(payload.version);
      const stillDirty=JSON.stringify(edits.current?.present)!==savedDocument.current;
      setDirty(stillDirty);setMessage(`${automatic?'Autosaved':'Saved'} revision ${payload.version}${stillDirty?' · newer edits pending':''}`);
      setHistory(current=>[{revision:payload.version,created_at:payload.savedAt,created_by_email:'You'},...current].slice(0,20));
    }catch(e){setError(e instanceof Error?e.message:'Save failed. Your edits are still here.');}
    finally{saveInFlight.current=false;setSaving(false);}
  }
  autosave.current=()=>{if(!autosavePaused.current&&(dirty||pendingInput))void save(true);};
  useEffect(()=>{const timer=window.setInterval(()=>autosave.current(),60000);return()=>window.clearInterval(timer);},[]);
  function download() {
    const href = URL.createObjectURL(new Blob([JSON.stringify(document,null,2)], {type:'application/json'}));
    const a = window.document.createElement('a'); a.href=href; a.download=`quote-${workspaceId}-draft.json`; a.click(); URL.revokeObjectURL(href);
  }
  function addLine() {
    const id = crypto.randomUUID();
    edit(next => { next.lines.push({id,name:'New item',type:'Fabrication',takeoffDriven:true,inputs:{...EMPTY_INPUTS},overrides:{},priceOverride:null}); });
    setSelected(id);
  }
  const selectedLine = document?.lines.find(line => line.id === selected);
  const selectedCalculation = calculation?.lines.find(line => line.id === selected);

  return <section ref={workbookRef} tabIndex={-1} className={`${styles.workbook} h-full p-4 sm:p-6`} aria-label="Workbook quote builder"
    onFocusCapture={e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)editGroup.current={};}}
    onBlurCapture={()=>{editGroup.current=null;setPendingInput(false);}}
    onInputCapture={e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)setPendingInput(true);}}
    onKeyDownCapture={e=>{if((e.metaKey||e.ctrlKey)&&!e.altKey&&(e.key.toLowerCase()==='z'||e.key.toLowerCase()==='y')){e.preventDefault();travelEdits(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');}}}>
    <div className={styles.frameHeader}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-semibold">{libraryItem?`Prequote item — ${document?.lines[0]?.name??'Loading…'}`:quoteName??'Quote builder'}</h1><p className="mt-1 text-sm text-muted-foreground">Paul’s v27 · Editable takeoffs, pricing and production budget</p><p role="status" className="mt-2 text-xs">{busy ? 'Working…' : saving?'Saving…':message} · Autosave every 60 seconds{!canEdit && !busy ? ' · Read-only' : ''}</p></div>
      <div className="flex flex-wrap gap-2">
        {document && <>
          <button className={button} disabled={!canEdit||busy||(!edits.current?.past.length&&!pendingInput)} title="Undo last change (⌘/Ctrl+Z)" onClick={()=>travelEdits('undo')}>↶ Undo</button>
          <button className={button} disabled={!canEdit||busy||!edits.current?.future.length} title="Redo last undone change (⌘/Ctrl+Shift+Z)" onClick={()=>travelEdits('redo')}>↷ Redo</button>
        </>}
        {document && <button className={button} onClick={download}>Download draft</button>}
        <button className={button} disabled={busy||saving} onClick={() => { if (!dirty || window.confirm('Discard unsaved edits and reload?')) void load(); }}>Reload saved</button>
        <button className={`${button} bg-foreground text-background`} disabled={!document || (!dirty&&!pendingInput) || !canEdit || busy || saving || !!result.error} onClick={() => void save()}>Save revision</button>
      </div>
    </div>
    {document&&!libraryItem&&<fieldset disabled={!canEdit||busy} className="my-3 flex flex-wrap items-end gap-3" aria-label="Quote schedule">
      {([['installDate','Install date'],['buildStart','Build start date'],['buildFinish','Build finish date']] as const).map(([key,label])=><label key={key} className="text-xs">{label}<input className={`${control} block`} aria-label={label} type="date" min="1900-01-01" max="2200-12-31" key={`${restoreKey}-${key}-${document.schedule?.[key]??''}`} defaultValue={document.schedule?.[key]??''} onClick={event=>{try{if(event.currentTarget.showPicker){event.currentTarget.showPicker();event.preventDefault();}}catch{/* Native date control remains usable. */}}} onBlur={event=>{const value=event.currentTarget.value;edit(next=>{next.schedule={...EMPTY_SCHEDULE,...next.schedule,[key]:value};});}}/></label>)}
      <label className="text-xs">Forecast status<select aria-label="Quote forecast status" className={`${control} block`} value={document.schedule?.status??''} onChange={event=>edit(next=>{next.schedule={...EMPTY_SCHEDULE,...next.schedule,status:event.target.value as typeof EMPTY_SCHEDULE.status};})}><option value="">Choose status</option>{FORECAST_STATUSES.map(status=><option key={status}>{status}</option>)}</select></label>
      <a className="text-xs underline" href="/capacity">Open Capacity tracker</a>
    </fieldset>}
    {(error || result.error) && <p role="alert" className="my-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">{error || result.error}</p>}
    {!document && !busy && !error && <p>No saved workbook. An editor can create the first revision.</p>}
    {document && <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div className="flex flex-wrap gap-2" role="tablist" aria-label="Workbook sections">{(libraryItem?['Settings','beMatrix Estimator','Takeoffs','Quote Builder','BOM','Pricing']:['Settings','beMatrix Estimator','Takeoffs','Quote Builder','Install Labor','Travel Estimator','Shipping Estimator','Client Quote','Budget Handoff','BOM','Legacy Decoder','Materials DB','Capacity','Pricing']).map(name => <button key={name} role="tab" aria-selected={tab===name} className={`${button} ${tab===name ? 'bg-accent font-semibold' : ''}`} onClick={() => {setSelectionSummary('');setTab(name);}}>{name}</button>)}</div>
        <select aria-label="Load saved revision" className={control} value="" disabled={busy||saving} onChange={e => { if (e.target.value && (!dirty || window.confirm('Discard unsaved edits and load this revision?'))) void load(Number(e.target.value)); }}><option value="">Saved history</option>{history.map(row => <option key={row.revision} value={row.revision}>Revision {row.revision} · {row.created_by_email}</option>)}</select>
      </div>}
    </div>
    <div className={styles.sheetViewport}>
    {document && <>
      <p className="mb-4 text-xs text-muted-foreground">Draft only. No quote is sent or published. Green cells calculate automatically. Pale yellow cells accept input. Pricing overrides take precedence.</p>
      {calculation?.warnings.map(warning => <p key={warning} className="mb-2 text-sm text-amber-700">{warning}</p>)}
      {(tab==='Pricing') && <div className="mb-4 flex flex-wrap items-center gap-3"><label className="text-sm">Item <select aria-label="Selected item" disabled={busy} className={`${control} ml-2 max-w-xs`} value={selected} onChange={e=>setSelected(e.target.value)}>{document.lines.map(line=><option key={line.id} value={line.id}>{line.name}</option>)}</select></label>{!libraryItem&&<button disabled={!canEdit || busy} className={button} onClick={addLine}>Add item</button>}{selectedLine && <><input aria-label="Item name" disabled={!canEdit || busy} className={control} value={selectedLine.name} onChange={e=>edit(next=>{next.lines.find(l=>l.id===selected)!.name=e.target.value;})}/><select aria-label="Item type" disabled={!canEdit || busy} className={control} value={selectedLine.type} onChange={e=>edit(next=>{next.lines.find(l=>l.id===selected)!.type=e.target.value as typeof selectedLine.type;})}>{LINE_TYPES.map(type=><option key={type}>{type}</option>)}</select></>}</div>}
      {['Install Labor','Travel Estimator','Shipping Estimator','beMatrix Estimator'].includes(tab)&&<QuoteGridInteraction onSummary={setSelectionSummary}><QuoteEstimators laborRate={calculation?.laborRate??0} key={`${restoreKey}-${tab}`} panel={{'Install Labor':'Install','Travel Estimator':'Travel','Shipping Estimator':'Shipping','beMatrix Estimator':'beMatrix'}[tab]} quote={document} edit={edit} readOnly={!canEdit||busy} result={calculation?.estimators}/></QuoteGridInteraction>}
      {tab==='BOM'&&calculation&&<QuoteBOM quote={document}/>}
      {tab==='Capacity'&&<div className="rounded border bg-white p-4"><h2>Capacity handoff</h2><p>The quote name, header dates, forecast status and calculated shop/trade hours appear in the Capacity tracker after saving. Planning overrides remain separate from quote inputs.</p><a className="underline" href="/capacity">Open Capacity tracker</a></div>}
      {tab==='Materials DB'&&<QuoteMaterialsDB quote={document}/>}
      {(tab==='Legacy Decoder')&&<div className="rounded border bg-white p-4"><h2>{tab} — upcoming</h2><p>This spreadsheet tab is not implemented in Tracker yet. Existing quote calculations and saved revisions are unaffected.</p></div>}

      <QuoteGridInteraction onSummary={setSelectionSummary}><fieldset className="min-w-0" disabled={!canEdit || busy}>
      {tab==='Quote Builder'&&!libraryItem&&canEdit&&<QuoteReusableToolbar quote={document} edit={edit} onSelect={setSelected}/>}
      {tab==='Quote Builder' && <QuoteSheet quote={document} calculation={calculation} edit={edit} onAdd={libraryItem?undefined:addLine} onTakeoffs={id=>{setSelected(id);setTab('Takeoffs');}}/>}
      {tab==='Takeoffs' && <QuoteTakeoffs workspaceId={workspaceId} save={()=>void save()} restoreKey={restoreKey} quote={document} edit={edit} selected={selected} onSelectItem={setSelected} libraryItem={libraryItem} onAddItem={addLine} readOnly={!canEdit || busy}/>}
      {tab==='Pricing' && selectedLine && <>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(inputLabels) as (keyof Inputs)[]).map(key=><label key={key} className="rounded border p-3 text-sm"><span className="mb-2 block">{inputLabels[key]}</span><Numeric label={inputLabels[key]} nullable value={selectedLine.overrides[key]??null} onChange={v=>edit(next=>{next.lines.find(l=>l.id===selected)!.overrides[key]=v;})}/><span className="ml-2 text-xs">Calculated: {number(selectedCalculation?.calculatedInputs[key]??0)}</span>{selectedLine.overrides[key]!=null && <button className="ml-2 text-xs underline" onClick={()=>edit(next=>{next.lines.find(l=>l.id===selected)!.overrides[key]=null;})}>Restore</button>}</label>)}</div>
        <div className="flex flex-wrap items-center gap-4 rounded border p-4"><span>Computed price: {money(selectedCalculation?.calculatedPrice??0)}</span><label>Price override <Numeric label="Price override" nullable value={selectedLine.priceOverride} onChange={v=>edit(next=>{next.lines.find(l=>l.id===selected)!.priceOverride=v;})}/></label><button className={button} disabled={selectedLine.priceOverride===null} onClick={()=>edit(next=>{next.lines.find(l=>l.id===selected)!.priceOverride=null;})}>Restore calculated price</button><strong>Final: {money(selectedCalculation?.finalPrice??0)}</strong></div>
      </>}
      {tab==='Settings' && <QuoteRates key={restoreKey} quote={document} edit={edit} laborRate={calculation?.laborRate??null}/>}
      </fieldset></QuoteGridInteraction>
      {tab==='Client Quote' && calculation && <div className="mx-auto max-w-3xl rounded-lg border p-6"><h2 className="text-xl font-semibold">Client quote · Draft</h2><table className="mt-5 w-full text-sm"><thead><tr><th className={cell}>Scope</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>{calculation.lines.filter(line=>line.finalPrice!==0).map(line=><tr key={line.id} className="border-t"><td className={cell}>{line.name}</td><td className="p-2 text-right tabular-nums">{money(line.finalPrice)}</td></tr>)}</tbody><tfoot><tr className="border-t font-bold"><td className={cell}>Total</td><td className="p-2 text-right">{money(calculation.totals.price)}</td></tr></tfoot></table></div>}
      {tab==='Budget Handoff' && calculation && <><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Item #','Item name','Materials / other','Allowed hours','Labor cost','Build budget','Trade hours','Untyped hours'].map(h=><th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>{calculation.lines.filter(line=>line.buildBudget!==0||line.finalPrice!==0).map(line=><tr key={line.id} className="border-t"><td className={cell}>{quoteItemLabel(document,line.id)}</td><td className={cell}>{line.name}</td><td className={cell}>{money(line.materialsBudget)}</td><td className={cell}>{number(line.hoursAllowed)}</td><td className={cell}>{money(line.laborBudget)}</td><td className={cell}>{money(line.buildBudget)}</td><td className={cell}>{Object.entries(line.tradeHours).map(([id,hours])=>`${document.trades.find(t=>t.id===id)?.name}: ${number(hours)}`).join(', ')||'—'}</td><td className={cell}>{number(line.untypedHours)}</td></tr>)}</tbody></table></div><p className="mt-4 font-semibold">Total build budget: {money(calculation.totals.buildBudget)}</p><p className="mt-2 text-sm">Contingency held separately: {money(calculation.totals.contingency)}</p></>}
    </>}
    </div>
    <footer className={styles.selectionFooter} role="status" aria-label="Selection summary">{selectionSummary||'Select numeric cells to see their total here.'}</footer>
  </section>;
}
