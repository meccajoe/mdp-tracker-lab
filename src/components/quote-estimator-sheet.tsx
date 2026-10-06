'use client';
import type {ReactNode} from 'react';
import {INSTALLERS,PEOPLE,PERSON_LABELS,type Estimators,type calculateEstimators} from '@/lib/quote-v27-estimators';
import {type QuoteV27} from '@/lib/quote-v27';
import styles from './quote-estimator-sheet.module.css';
const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
function NumberCell({label,value,change,nullable=false,placeholder='',signed=false}:{label:string;value:number|null;change:(value:number|null)=>void;nullable?:boolean;placeholder?:string;signed?:boolean}){
 return <input aria-label={label} key={value??'auto'} type="number" step="any" min={signed?undefined:0} defaultValue={value===0&&!nullable?'':value??''} placeholder={placeholder} onBlur={event=>{const next=event.target.value===''?(nullable?null:0):Number(event.target.value);if(next!==value)change(next);}} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>;
}
export function QuoteEstimatorSheet({kind,quote,result,update,links,laborRate}:{kind:'Install'|'Travel';laborRate:number;quote:QuoteV27;result?:ReturnType<typeof calculateEstimators>|null;update:(fn:(e:Estimators)=>void)=>void;links:ReactNode}){
 const e=quote.estimators!,s=quote.settings;
 const people=kind==='Install'?INSTALLERS:PEOPLE;
 const row=(label:string,cells:ReactNode[],computed=false)=><tr key={label} className={computed?styles.computed:undefined}><th scope="row">{label}</th>{cells.map((cell,i)=><td key={i}>{cell}</td>)}</tr>;
 const section=(label:string)=><tr key={label} className={styles.section}><th colSpan={people.length+1}>{label}</th></tr>;
 const travelNumber=(key:'installDays'|'offDays'|'dismantleDays'|'daysPerTrip'|'hotelAdjustment',label:string)=>row(label,PEOPLE.map(id=>{
  const person=e.travel.people[id];const follows=person.useInstallDays&&id!=='pm'&&['installDays','offDays','dismantleDays'].includes(key);
  return follows?<span title="Follows Install Labor">{e.install[id as typeof INSTALLERS[number]][key as 'installDays'|'offDays'|'dismantleDays']}</span>:<NumberCell label={`${PERSON_LABELS[id]} ${label}`} value={person[key]} signed={key==='hotelAdjustment'} change={value=>update(next=>{next.travel.people[id][key]=value??0;})}/>;
 }));
 const travelSwitch=(key:'traveling'|'stays'|'roadBonus',label:string)=>row(label,PEOPLE.map(id=><select aria-label={`${PERSON_LABELS[id]} ${label}`} value={e.travel.people[id][key]?'Yes':'No'} onChange={event=>update(next=>{next.travel.people[id][key]=event.target.value==='Yes';})}><option>No</option><option>Yes</option></select>));
 const support=e.install.support;
 const days=support.daily??Array.from({length:10},(_,i)=>({installDays:i===0?support.installDays:0,dismantleDays:i===0?support.dismantleDays:0,offDays:i===0?support.offDays:0}));
 const internalCost=(result?.install.reduce((sum,p)=>sum+p.days,0)??0)*s.siteHours*laborRate+(result?.supportDays??0)*s.supportCost;
 const totalBilling=(result?.install.reduce((sum,p)=>sum+p.billing,0)??0)+(result?.supportBilling??0);
 return <div className={styles.sheet}><h2>{kind==='Install'?'Install Labor Estimator':'Travel Budget Estimator — up to 4 travelers'}</h2><p>{kind==='Install'?'Enter each installer’s day counts below. Green rows calculate automatically. Blank travel days follow the Travel Estimator; typing a value overrides them.':'Each traveler has a column. Set their trip shape, then shared unit costs. Green rows show calculated trip counts and costs.'}</p>
 <table aria-label={`${kind} estimator worksheet`}><thead><tr><th>{kind==='Install'?'Our installers — day counts':'Trip shape — per traveler'}</th>{people.map(id=><th key={id}>{PERSON_LABELS[id]}</th>)}</tr></thead><tbody>
 {kind==='Install'?<>
 {(['installDays','offDays','dismantleDays','travelDaysOverride'] as const).map((key,i)=>row(['Install days (on site)','Off days (in market, not working)','Dismantle days (on site)','Travel days (auto; type to override)'][i],INSTALLERS.map(id=><NumberCell label={`${PERSON_LABELS[id]} ${key}`} value={e.install[id][key]} nullable={key==='travelDaysOverride'} placeholder={key==='travelDaysOverride'?String(result?.install.find(p=>p.id===id)?.travelDays??0):''} change={value=>update(next=>{Object.assign(next.install[id],{[key]:value});})}/>)))}
 {row('TOTAL DAYS',INSTALLERS.map(id=>result?.install.find(p=>p.id===id)?.days??0),true)}
 {section('Billing (auto) — lead at lead rate, installers 2 & 3 at support rate')}
 {row('Install + dismantle days billing',INSTALLERS.map(id=>money((e.install[id].installDays+e.install[id].dismantleDays)*(id==='lead'?s.leadDay:s.supportDay))),true)}
 {row('Off days billing',INSTALLERS.map(id=>money(e.install[id].offDays*s.offFactor*(id==='lead'?s.leadDay:s.supportDay))),true)}
 {row('Travel days billing',INSTALLERS.map(id=>money((result?.install.find(p=>p.id===id)?.travelDays??0)*s.travelFactor*(id==='lead'?s.leadDay:s.supportDay))),true)}
 {row('TOTAL LABOR BILLING',INSTALLERS.map(id=>money(result?.install.find(p=>p.id===id)?.billing??0)),true)}
 {section('Hired local support crew — day by day (people on site each day)')}
 <tr className={styles.section}><th>Day</th><th>Install crew</th><th>Dismantle crew</th><th>Off-day crew</th></tr>
 {days.map((day,index)=>row(`Day ${index+1}`,(['installDays','dismantleDays','offDays'] as const).map(key=><NumberCell label={`Support day ${index+1} ${key}`} value={day[key]} change={value=>update(next=>{const grid=structuredClone(days);grid[index][key]=value??0;next.install.support.daily=grid;for(const field of ['installDays','dismantleDays','offDays'] as const)next.install.support[field]=grid.reduce((sum,d)=>sum+d[field],0);})}/>)))}
 {row('TOTAL person-days',[support.installDays,support.dismantleDays,support.offDays],true)}
 {section('Support billing & budget (auto)')}
 {row('Install + dismantle support billing',[money((support.installDays+support.dismantleDays)*s.supportDay)],true)}
 {row('Off-day support billing',[money(support.offDays*s.offFactor*s.supportDay)],true)}
 {row('TOTAL SUPPORT BILLING',[money(result?.supportBilling??0)],true)}
 {row('Local crew invoice budget',[money((result?.supportDays??0)*s.supportCost)],true)}
 {section('SANITY CHECK — install labor on this quote')}
 {row('TOTAL INSTALL LABOR BILLED',[money(totalBilling)],true)}
 {row('Our internal cost (hours × burdened + support cost)',[money(internalCost)],true)}
 {row('Install labor margin',[money(totalBilling-internalCost),totalBilling?`${((totalBilling-internalCost)/totalBilling*100).toFixed(1)}%`:'—'],true)}
 </>:<>
 {travelSwitch('traveling','Traveling?')}
 {travelNumber('installDays','Install days (on site)')}
 {travelNumber('offDays','Off days (in market, not working)')}
 {travelNumber('dismantleDays','Dismantle days (on site)')}
 {travelSwitch('stays','Stays in market through off days?')}
 {travelNumber('daysPerTrip','Travel days per round trip')}
 {travelNumber('hotelAdjustment','Hotel nights adjustment (+/−)')}
 {travelSwitch('roadBonus','Gets lead road bonus?')}
 {row('Follow Install Labor day counts',PEOPLE.map(id=>id==='pm'?'—':<select aria-label={`${PERSON_LABELS[id]} follow install days`} value={e.travel.people[id].useInstallDays?'Yes':'No'} onChange={event=>update(next=>{next.travel.people[id].useInstallDays=event.target.value==='Yes';})}><option>No</option><option>Yes</option></select>))}
 {section('Trip math (auto)')}
 {(['trips','marketDays','travelDays','roadDays','hotelNights'] as const).map((key,i)=>row(['Round trips','Days in market','Travel days','Road days','Hotel nights'][i],PEOPLE.map(id=>result?.travel.find(p=>p.id===id)?.[key]??0),true))}
 {section('Unit costs (shared — tune per destination)')}
 {Object.entries({airfare:'Airfare ($/person/round trip)',hotel:'Hotel ($/room/night)',perDiem:'Per diem ($/person/road day)',vehicle:'Vehicle ($/vehicle/day)',vehicles:'Rental vehicles (count)',baggage:'Baggage & misc ($/person/trip)',roadBonus:'Lead road bonus ($/road day)',other:'Other costs (lump $)'}).map(([key,label])=>row(label,[<NumberCell key={key} label={label} value={e.travel.rates[key as keyof typeof e.travel.rates]} change={value=>update(next=>{next.travel.rates[key as keyof typeof e.travel.rates]=value??0;})}/>]))}
 {section('Cost buildup (auto)')}
 {(['Airfare','Hotel','Per diem','Baggage & misc','Road bonus'] as const).map((label,index)=>row(label,PEOPLE.map(id=>{const p=result?.travel.find(p=>p.id===id),r=e.travel.rates;return money(!p?0:[p.trips*r.airfare,p.hotelNights*r.hotel,p.roadDays*r.perDiem,p.trips*r.baggage,e.travel.people[id].roadBonus?p.roadDays*r.roadBonus:0][index]);}),true))}
 {row('PERSON TOTAL',PEOPLE.map(id=>money(result?.travel.find(p=>p.id===id)?.cost??0)),true)}
 {row('Vehicles (count × $/day × longest road days)',[money(e.travel.rates.vehicles*e.travel.rates.vehicle*Math.max(0,...(result?.travel.map(p=>p.roadDays)??[])))],true)}
 {row('Other',[money(e.travel.rates.other)],true)}
 {row('TOTAL TRAVEL COST',[money(result?.travelCost??0)],true)}
 {row('Markup on travel',[`${s.travelMarkup*100}%`],true)}
 {row('PRICE TO CLIENT (before commission)',[money((result?.travelCost??0)*(1+s.travelMarkup))],true)}
 {section('Per-person split (to quote travel separately)')}
 {row('Share of vehicles & other',PEOPLE.map(id=>money(result?.travel.find(p=>p.id===id)?.shared??0)),true)}
 {row('PERSON COST (including shared)',PEOPLE.map(id=>money(result?.travel.find(p=>p.id===id)?.total??0)),true)}
 </>}
 </tbody></table><div className={styles.links}>{links}</div></div>;
}
