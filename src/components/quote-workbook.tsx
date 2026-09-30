"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { QuoteEstimators } from '@/components/quote-estimators';
import { QuoteRates } from "@/components/quote-rates";
import { QuoteSheet } from '@/components/quote-sheet';
import { adaFetch } from '@/lib/ada-client';
import { calculateQuoteV27, EMPTY_INPUTS, LINE_TYPES, type Inputs, type QuoteV27 } from '@/lib/quote-v27';
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

export function QuoteWorkbook({ workspaceId, onDirtyChange }: { workspaceId: string; onDirtyChange: (dirty: boolean) => void }) {
  const [document, setDocument] = useState<QuoteV27 | null>(null);
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<History[]>([]);
  const [dirty, setDirty] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Quote Builder');
  const [selected, setSelected] = useState('');
  const endpoint = `/api/quote-workspaces/${workspaceId}/workbook`;
  const load = useCallback(async (revision?: number) => {
    setBusy(true); setError('');
    try {
      const response = await adaFetch(endpoint + (revision ? `?revision=${revision}` : ''));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Workbook could not load.');
      const next = payload.document ? parseQuoteV27(payload.document) : null;
      setDocument(next); setSelected(next?.lines[0]?.id ?? '');
      setVersion(payload.latestVersion); setHistory(payload.history); setCanEdit(payload.canEdit);
      const restoring = Boolean(revision && revision !== payload.latestVersion);
      setDirty(restoring);
      setMessage(restoring ? `Revision ${revision} loaded. Save to keep it as a new revision.` : payload.version ? `Saved revision ${payload.version}` : 'No saved workbook yet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Workbook could not load.'); }
    finally { setBusy(false); }
  }, [endpoint]);
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
    try { return { calculation: calculateQuoteV27(document), error: '' }; }
    catch (e) { return { calculation: null, error: e instanceof Error ? e.message : 'Check your inputs.' }; }
  }, [document]);
  const calculation = result.calculation;
  function edit(change: (next: QuoteV27) => void) {
    if (!canEdit || busy) return;
    setDocument(current => { if (!current) return current; const next = structuredClone(current); change(next); return next; });
    setDirty(true); setMessage('Unsaved changes'); setError('');
  }
  async function start(template: string) {
    setBusy(true); setError('');
    try {
      const response = await adaFetch(`${endpoint}?template=${template}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const next = parseQuoteV27(payload.document);
      setDocument(next); setSelected(next.lines[0]?.id ?? ''); setDirty(true); setMessage('Template loaded — save your first revision.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Template could not load.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!document) return;
    setBusy(true); setError('');
    try {
      const response = await adaFetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({expectedVersion:version,document}) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Save failed.');
      setVersion(payload.version); setDirty(false); setMessage(`Saved revision ${payload.version}`);
      setHistory(current => [{revision:payload.version,created_at:payload.savedAt,created_by_email:'You'},...current].slice(0,20));
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed. Your edits are still here.'); }
    finally { setBusy(false); }
  }
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

  return <section className="h-full overflow-auto p-4 sm:p-6" aria-label="Workbook quote builder">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Quote builder</h1><p className="mt-1 text-sm text-muted-foreground">Paul’s v27 · Editable takeoffs, pricing and production budget</p><p role="status" className="mt-2 text-xs">{busy ? 'Working…' : message}{!canEdit && !busy ? ' · Read-only' : ''}</p></div>
      <div className="flex flex-wrap gap-2">
        {document && <button className={button} onClick={download}>Download draft</button>}
        <button className={button} disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard unsaved edits and reload?')) void load(); }}>Reload saved</button>
        <button className={`${button} bg-foreground text-background`} disabled={!document || !dirty || !canEdit || busy || !!result.error} onClick={() => void save()}>Save revision</button>
      </div>
    </div>
    {(error || result.error) && <p role="alert" className="my-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">{error || result.error}</p>}
    {!document && !busy && !error && <div className="my-10 rounded-xl border p-6"><h2 className="font-semibold">Start from your blank v27 template</h2><p className="my-3 text-sm text-muted-foreground">Your item rows, service lines and rate card, with zero estimates. Item and spare rows start as Fabrication; choose another line type as needed.</p><button className={button} disabled={!canEdit} onClick={() => void start('blank')}>Start blank quote</button></div>}
    {document && <>
      <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div className="flex flex-wrap gap-2" role="tablist" aria-label="Workbook sections">{['Quote Builder','Takeoffs','Pricing','Estimators','Client quote','Production budget','Rates'].map(name => <button key={name} role="tab" aria-selected={tab===name} className={`${button} ${tab===name ? 'bg-accent font-semibold' : ''}`} onClick={() => setTab(name)}>{name}</button>)}</div>
        <select aria-label="Load saved revision" className={control} value="" disabled={busy} onChange={e => { if (e.target.value && (!dirty || window.confirm('Discard unsaved edits and load this revision?'))) void load(Number(e.target.value)); }}><option value="">Saved history</option>{history.map(row => <option key={row.revision} value={row.revision}>Revision {row.revision} · {row.created_by_email}</option>)}</select>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Draft only. No quote is sent or published. Use Estimators for install, travel, shipping and beMatrix; Pricing overrides take precedence.</p>
      {calculation?.warnings.map(warning => <p key={warning} className="mb-2 text-sm text-amber-700">{warning}</p>)}
      {(tab==='Takeoffs' || tab==='Pricing') && <div className="mb-4 flex flex-wrap items-center gap-3"><label className="text-sm">Item <select aria-label="Selected item" disabled={busy} className={`${control} ml-2 max-w-xs`} value={selected} onChange={e=>setSelected(e.target.value)}>{document.lines.map(line=><option key={line.id} value={line.id}>{line.name}</option>)}</select></label><button disabled={!canEdit || busy} className={button} onClick={addLine}>Add item</button>{selectedLine && <><input aria-label="Item name" disabled={!canEdit || busy} className={control} value={selectedLine.name} onChange={e=>edit(next=>{next.lines.find(l=>l.id===selected)!.name=e.target.value;})}/><select aria-label="Item type" disabled={!canEdit || busy} className={control} value={selectedLine.type} onChange={e=>edit(next=>{next.lines.find(l=>l.id===selected)!.type=e.target.value as typeof selectedLine.type;})}>{LINE_TYPES.map(type=><option key={type}>{type}</option>)}</select></>}</div>}
      {tab==='Estimators' && <><QuoteEstimators quote={document} edit={edit} readOnly={!canEdit || busy} result={calculation?.estimators}/>{calculation?.estimators && <div className="mt-5 rounded border p-4 text-sm"><p>Install labor billing: {money(calculation.estimators.install.reduce((n,p)=>n+p.billing,0)+calculation.estimators.supportBilling)}</p><p>Travel cost: {money(calculation.estimators.travelCost)}</p><p>Shipping cost: {money(calculation.estimators.shippingCost)}</p></div>}</>}
      <fieldset className="min-w-0" disabled={!canEdit || busy}>
      {tab==='Quote Builder' && <QuoteSheet quote={document} calculation={calculation} edit={edit} onAdd={addLine} onTakeoffs={id=>{setSelected(id);setTab('Takeoffs');}}/>}
      {tab==='Takeoffs' && selectedLine && <>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Description / catalog','Quantity','Unit cost','Sections ×','Labor hours','Trade','Resale','Extended cost','Extended hours',''].map((h,i)=><th className={cell} key={i}>{h}</th>)}</tr></thead><tbody>{document.takeoffs.filter(row=>row.lineId===selected).map(row=>{
          const computed=calculation?.takeoffs.find(item=>item.id===row.id);
          const update=(key:string,value:unknown)=>edit(next=>{Object.assign(next.takeoffs.find(r=>r.id===row.id)!,{[key]:value});});
          return <tr key={row.id} className="border-t"><td className={cell}><input aria-label={`Description ${row.id}`} className={`${control} w-60`} value={row.description} onChange={e=>update('description',e.target.value)}/><select aria-label={`Catalog ${row.id}`} className={`${control} mt-1 w-60`} value={row.materialId??''} onChange={e=>edit(next=>{const r=next.takeoffs.find(r=>r.id===row.id)!;const m=next.catalog.find(m=>m.id===e.target.value);r.materialId=m?.id??null;r.unitCostOverride=m?null:0;if(m)r.description=m.name;})}><option value="">Custom material / labor</option>{document.catalog.map(m=><option key={m.id} value={m.id}>{m.name} · {m.unit}</option>)}</select></td>
          <td className={cell}><Numeric label={`Quantity ${row.id}`} value={row.quantity} onChange={v=>update('quantity',v)}/></td>
          <td className={cell}><Numeric label={`Cost override ${row.id}`} nullable value={row.unitCostOverride} onChange={v=>update('unitCostOverride',v)}/><div className="mt-1 text-xs">Using {money(computed?.unitCost??0)} {row.unitCostOverride!==null && row.materialId && <button className="underline" onClick={()=>update('unitCostOverride',null)}>Restore catalog</button>}</div></td>
          <td className={cell}><Numeric label={`Sections ${row.id}`} nullable value={row.sections} onChange={v=>update('sections',v)}/></td>
          <td className={cell}><Numeric label={`Hours ${row.id}`} value={row.hours} onChange={v=>update('hours',v)}/></td>
          <td className={cell}><select aria-label={`Trade ${row.id}`} className={control} value={row.tradeId??''} onChange={e=>update('tradeId',e.target.value||null)}><option value="">Untyped</option>{document.trades.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
          <td className={cell}><input aria-label={`Resale ${row.id}`} type="checkbox" checked={row.resale} onChange={e=>update('resale',e.target.checked)}/></td><td className={cell}>{money(computed?.cost??0)}</td><td className={cell}>{number(computed?.extendedHours??0)}</td><td className={cell}><button className={button} aria-label={`Remove ${row.description}`} onClick={()=>edit(next=>{next.takeoffs=next.takeoffs.filter(r=>r.id!==row.id);})}>Remove</button></td></tr>;
        })}</tbody></table></div>
        <button className={`${button} mt-3`} onClick={()=>edit(next=>{next.takeoffs.push({id:crypto.randomUUID(),lineId:selected,description:'New takeoff',materialId:null,tradeId:null,quantity:0,sections:null,unitCostOverride:0,hours:0,resale:false});})}>Add takeoff</button>
        <p className="mt-3 text-xs text-muted-foreground">Blank sections means 1. Blank cost uses the saved catalog. A zero is an explicit override.</p>
      </>}
      {tab==='Pricing' && selectedLine && <>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(inputLabels) as (keyof Inputs)[]).map(key=><label key={key} className="rounded border p-3 text-sm"><span className="mb-2 block">{inputLabels[key]}</span><Numeric label={inputLabels[key]} nullable value={selectedLine.overrides[key]??null} onChange={v=>edit(next=>{next.lines.find(l=>l.id===selected)!.overrides[key]=v;})}/><span className="ml-2 text-xs">Calculated: {number(selectedCalculation?.calculatedInputs[key]??0)}</span>{selectedLine.overrides[key]!=null && <button className="ml-2 text-xs underline" onClick={()=>edit(next=>{next.lines.find(l=>l.id===selected)!.overrides[key]=null;})}>Restore</button>}</label>)}</div>
        <div className="flex flex-wrap items-center gap-4 rounded border p-4"><span>Computed price: {money(selectedCalculation?.calculatedPrice??0)}</span><label>Price override <Numeric label="Price override" nullable value={selectedLine.priceOverride} onChange={v=>edit(next=>{next.lines.find(l=>l.id===selected)!.priceOverride=v;})}/></label><button className={button} disabled={selectedLine.priceOverride===null} onClick={()=>edit(next=>{next.lines.find(l=>l.id===selected)!.priceOverride=null;})}>Restore calculated price</button><strong>Final: {money(selectedCalculation?.finalPrice??0)}</strong></div>
      </>}
      {tab==='Rates' && <QuoteRates quote={document} edit={edit} laborRate={calculation?.laborRate??null}/>}
      </fieldset>
      {tab==='Client quote' && calculation && <div className="mx-auto max-w-3xl rounded-lg border p-6"><h2 className="text-xl font-semibold">Client quote · Draft</h2><table className="mt-5 w-full text-sm"><thead><tr><th className={cell}>Scope</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>{calculation.lines.filter(line=>line.finalPrice!==0).map(line=><tr key={line.id} className="border-t"><td className={cell}>{line.name}</td><td className="p-2 text-right tabular-nums">{money(line.finalPrice)}</td></tr>)}</tbody><tfoot><tr className="border-t font-bold"><td className={cell}>Total</td><td className="p-2 text-right">{money(calculation.totals.price)}</td></tr></tfoot></table></div>}
      {tab==='Production budget' && calculation && <><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Item','Materials / other','Allowed hours','Labor cost','Build budget','Trade hours','Untyped hours'].map(h=><th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>{calculation.lines.filter(line=>line.buildBudget!==0||line.finalPrice!==0).map(line=><tr key={line.id} className="border-t"><td className={cell}>{line.name}</td><td className={cell}>{money(line.materialsBudget)}</td><td className={cell}>{number(line.hoursAllowed)}</td><td className={cell}>{money(line.laborBudget)}</td><td className={cell}>{money(line.buildBudget)}</td><td className={cell}>{Object.entries(line.tradeHours).map(([id,hours])=>`${document.trades.find(t=>t.id===id)?.name}: ${number(hours)}`).join(', ')||'—'}</td><td className={cell}>{number(line.untypedHours)}</td></tr>)}</tbody></table></div><p className="mt-4 font-semibold">Total build budget: {money(calculation.totals.buildBudget)}</p><p className="mt-2 text-sm">Contingency held separately: {money(calculation.totals.contingency)}</p></>}
    </>}
  </section>;
}
