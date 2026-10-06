"use client";
import { useState } from 'react';
import {QuoteEstimatorSheet} from './quote-estimator-sheet';
import { emptyEstimators, INSTALLERS, PEOPLE, PERSON_LABELS, WALL_TEMPLATE, type Estimators, type calculateEstimators } from '@/lib/quote-v27-estimators';
import type { Inputs, QuoteV27 } from '@/lib/quote-v27';

const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
const control='rounded border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50';
function Numbers({values,labels,change}:{values:object;labels:Record<string,string>;change:(key:string,value:number|null)=>void}) {
  return <div className="flex flex-wrap gap-3">{Object.entries(labels).map(([key,label])=>{
    const value=(values as Record<string,number|null>)[key];
    const nullable=key.endsWith('Override');
    return <label key={key} className="text-xs">{label}<input aria-label={label} className={`${control} mt-1 block w-32`} type="number" step="any" min={key==='hotelAdjustment'?undefined:0} key={`${key}-${value}`} defaultValue={value===0&&!nullable?'':value??''} placeholder={nullable?'Calculated':''} onBlur={e=>{const next=e.target.value===''?(nullable?null:0):Number(e.target.value);if(next!==value)change(key,next);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
  })}</div>;
}

export function QuoteEstimators({quote,edit,readOnly=false,result,panel,laborRate=0}:{quote:QuoteV27;laborRate?:number;panel?:string;readOnly?:boolean;result?:ReturnType<typeof calculateEstimators>|null;edit:(change:(quote:QuoteV27)=>void)=>void}) {
  const [localTab,setTab]=useState('Install');
  const tab=panel??localTab;
  const e=quote.estimators;
  if(!e)return <div className="rounded border p-4"><p className="mb-3 text-sm">This revision uses saved estimator totals. Enable editable estimators, then choose their destination quote items. Existing totals stay unchanged until you link an output.</p><button disabled={readOnly} className={control} onClick={()=>edit(q=>{q.estimators=emptyEstimators();})}>Enable estimators</button></div>;
  const update=(fn:(e:Estimators)=>void)=>edit(q=>fn(q.estimators!));
  const link=(label:string,value:string|null,type:string,keys:(keyof Inputs)[],set:(e:Estimators,id:string|null)=>void)=><label key={label} className="my-3 block text-sm">{label}<select aria-label={label} className={`${control} ml-2 max-w-full`} value={value??''} onChange={event=>edit(q=>{
    const id=event.target.value||null;
    // Linked values replace cached inputs. Do not revive stale totals when disconnected.
    for(const target of [value,id]){const line=q.lines.find(l=>l.id===target);if(line)for(const key of keys)line.inputs[key]=0;}
    set(q.estimators!,id);
  })}><option value="">Not linked</option>{quote.lines.filter(l=>l.type===type).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><span className="ml-2 text-xs text-muted-foreground">{type}</span></label>;
  const toggle=(label:string,value:boolean,change:(v:boolean)=>void)=><label className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" aria-label={label} checked={value} onChange={event=>change(event.target.checked)}/>{label}</label>;
  return <div>
    {!panel&&<div className="mb-4 flex flex-wrap gap-2">{['Install','Travel','Shipping','beMatrix'].map(name=><button key={name} className={`${control} ${tab===name?'bg-accent font-semibold':''}`} onClick={()=>setTab(name)}>{name} estimator</button>)}</div>}
    <p className="mb-4 text-xs text-muted-foreground">Choose a destination item for each output. Item-level pricing overrides still take precedence; clear them in Pricing to restore the estimator value.</p>
    <fieldset disabled={readOnly}>
    {(tab==='Install'||tab==='Travel')&&<QuoteEstimatorSheet laborRate={laborRate} kind={tab} quote={quote} result={result} update={update} links={tab==='Install'?<>{INSTALLERS.map(id=>link(`${PERSON_LABELS[id]} billing item`,e.install[id].lineId,'Installer Days',['siteDays','cost'],(x,v)=>{x.install[id].lineId=v;}))}{link('Hired support item',e.install.support.lineId,'Install Support Labor',['siteDays','cost'],(x,v)=>{x.install.support.lineId=v;})}</>:<>{link('Lead expenses item',e.travel.leadLineId,'Travel & Expenses',['cost'],(x,v)=>{x.travel.leadLineId=v;})}{link('Other travelers expenses item',e.travel.otherLineId,'Travel & Expenses',['cost'],(x,v)=>{x.travel.otherLineId=v;})}{link('PM travel billing item',e.travel.pmLineId,'Travel — Project Manager',['travelDays'],(x,v)=>{x.travel.pmLineId=v;})}</>}/>}
    {tab==='Shipping'&&<>
      {(['outbound','return'] as const).map(id=><div key={id} className="mb-4 rounded border p-4"><h3 className="mb-3 font-semibold">{id==='outbound'?'Outbound shipment':'Return shipment'}</h3>{toggle(`Ship ${id}`,e.shipping[id].enabled,v=>update(x=>{x.shipping[id].enabled=v;}))}<label className="mr-3 text-sm">Mode <select aria-label={`${id} shipping mode`} className={control} value={e.shipping[id].mode} onChange={event=>update(x=>{x.shipping[id].mode=event.target.value;})}>{['Our truck','Rented truck','LTL freight','FTL freight'].map(mode=><option key={mode}>{mode}</option>)}</select></label><label className="text-sm">Driver <select aria-label={`${id} driver`} className={control} value={e.shipping[id].driver} onChange={event=>update(x=>{x.shipping[id].driver=event.target.value;})}>{['Lead installer','Shop driver','Carrier'].map(driver=><option key={driver}>{driver}</option>)}</select></label><div className="mt-3"><Numbers values={e.shipping[id]} labels={{miles:`${id} miles`,carrierQuote:`${id} carrier quote`,misc:`${id} tolls and misc`}} change={(key,v)=>update(x=>Object.assign(x.shipping[id],{[key]:v}))}/></div>{result&&<p className="mt-3 text-sm">{result.shipping.find(leg=>leg.id===id)?.days} driving days · {money(result.shipping.find(leg=>leg.id===id)?.total??0)} leg cost</p>}</div>)}
      <Numbers values={e.shipping.rates} labels={{fuel:'Fuel per gallon',mpg:'Truck MPG',wear:'Wear per mile',rentalDay:'Truck rental per day',rentalMile:'Rental per mile',driverDay:'Shop driver cost per day',milesPerDay:'Maximum miles per day'}} change={(key,v)=>update(x=>Object.assign(x.shipping.rates,{[key]:v}))}/>{link('Freight quote item',e.shipping.lineId,'Freight',['cost'],(x,v)=>{x.shipping.lineId=v;})}
    </>}
    {tab==='beMatrix'&&<><Numbers values={e.beMatrix} labels={{frameRental:'Frame rental rate',frameWidth:'Frame width in feet',frameHeight:'Frame height in feet'}} change={(key,v)=>update(x=>Object.assign(x.beMatrix,{[key]:v}))}/><p className="my-3 text-xs text-muted-foreground">Frames round up in both dimensions. SEG pricing uses the quote’s Graphics sell rate. Several walls can feed the same item.</p>
      {e.beMatrix.walls.map((wall,index)=><div key={wall.id} className="my-4 rounded border p-4"><h3 className="mb-3 font-semibold">Wall {index+1}</h3>{!wall.lineId&&<p role="alert" className="mb-3 rounded border border-amber-300 bg-amber-50 p-2">Not included in quote — choose the destination quote item below.</p>}<Numbers values={wall} labels={{width:`Wall ${index+1} width`,height:`Wall ${index+1} height`,sides:`Wall ${index+1} SEG sides`,sqftOverride:`Wall ${index+1} sqft override`}} change={(key,v)=>update(x=>Object.assign(x.beMatrix.walls.find(w=>w.id===wall.id)!,{[key]:v}))}/>{link(`Wall ${index+1} quote item`,wall.lineId,'beMatrix / SEG',['sqft','panels','rental'],(x,v)=>{x.beMatrix.walls.find(w=>w.id===wall.id)!.lineId=v;})}{result&&<p className="my-2 text-sm">{result.walls.find(w=>w.id===wall.id)?.panels} frames · {result.walls.find(w=>w.id===wall.id)?.sqft} SEG sqft · {money(result.walls.find(w=>w.id===wall.id)?.rental??0)} rental + {money((result.walls.find(w=>w.id===wall.id)?.sqft??0)*quote.settings.graphicsSell)} SEG = {money((result.walls.find(w=>w.id===wall.id)?.rental??0)+(result.walls.find(w=>w.id===wall.id)?.sqft??0)*quote.settings.graphicsSell)} before commission</p>}<button className={control} onClick={()=>update(x=>{x.beMatrix.walls=x.beMatrix.walls.filter(w=>w.id!==wall.id);})}>Remove wall {index+1}</button></div>)}<button className={control} onClick={()=>update(x=>{x.beMatrix.walls.push({...WALL_TEMPLATE,id:crypto.randomUUID(),lineId:quote.lines.find(line=>line.type==='beMatrix / SEG')?.id??null});})}>Add wall</button>
    </>}
    </fieldset>
  </div>;
}
