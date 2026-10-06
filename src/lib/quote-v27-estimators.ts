import type { Inputs, QuoteV27 } from './quote-v27';

export const PEOPLE = ['lead', 'pm', 'second', 'third'] as const;
export const INSTALLERS = ['lead', 'second', 'third'] as const;
export const PERSON_LABELS = {lead:'Lead installer',pm:'Project manager',second:'Installer 2',third:'Installer 3'};
export const WALL_TEMPLATE = {id:'',lineId:null as string|null,width:0,height:0,sides:1,sqftOverride:null as number|null};
const traveler = () => ({traveling:false,installDays:0,offDays:0,dismantleDays:0,useInstallDays:false,stays:true,daysPerTrip:2,hotelAdjustment:0,roadBonus:false});
const installer = () => ({installDays:0,offDays:0,dismantleDays:0,travelDaysOverride:null as number|null,lineId:null as string|null});
const leg = () => ({enabled:false,mode:'Our truck',driver:'Lead installer',miles:0,carrierQuote:0,misc:0});
export function emptyEstimators() {
  return {
    version:1,
    install:{lead:installer(),second:installer(),third:installer(),support:{installDays:0,dismantleDays:0,offDays:0,lineId:null as string|null}},
    travel:{people:{lead:traveler(),pm:traveler(),second:{...traveler(),useInstallDays:true},third:{...traveler(),useInstallDays:true}},
      rates:{airfare:1000,hotel:450,perDiem:70,vehicle:65,vehicles:1,baggage:100,roadBonus:50,other:0},
      leadLineId:null as string|null,otherLineId:null as string|null,pmLineId:null as string|null},
    shipping:{outbound:leg(),return:leg(),rates:{fuel:6.5,mpg:8,wear:0.8,rentalDay:250,rentalMile:0.35,driverDay:410,milesPerDay:500},lineId:null as string|null},
    beMatrix:{frameRental:250,frameWidth:3.25,frameHeight:8,walls:[] as (typeof WALL_TEMPLATE)[]},
  };
}
export type SupportDay = {installDays:number;dismantleDays:number;offDays:number};
export type Estimators = ReturnType<typeof emptyEstimators> & {install:{support:{daily?:SupportDay[]}}};

/** Accept only the versioned estimator schema, including signed hotel adjustments. */
export function parseEstimators(value: unknown): Estimators {
  function walk(shape: unknown, input: unknown, key: string): unknown {
    if (shape === null) {
      if (input === null) return null;
      if (/lineId$/i.test(key)) {
        if (typeof input !== 'string' || !input || input.length>200) throw new Error('Invalid estimator line link.');
        return input;
      }
      shape=0;
    }
    if (typeof shape==='number') {
      if (typeof input!=='number' || !Number.isFinite(input) || Math.abs(input)>1e9 || (key!=='hotelAdjustment' && input<0)) throw new Error(`Invalid estimator number: ${key}`);
      return input;
    }
    if (typeof shape==='boolean') {if(typeof input!=='boolean') throw new Error(`Invalid estimator switch: ${key}`); return input;}
    if (typeof shape==='string') {if(typeof input!=='string' || input.length>200 || !input) throw new Error(`Invalid estimator text: ${key}`); return input;}
    if (Array.isArray(shape)) {if(!Array.isArray(input)||input.length>200) throw new Error('At most 200 walls are supported.');return input.map(row=>walk(WALL_TEMPLATE,row,'wall'));}
    if (!input || typeof input!=='object'||Array.isArray(input)) throw new Error(`Missing estimator section: ${key}`);
    return Object.fromEntries(Object.entries(shape as object).map(([k,v])=>[k,walk(v,(input as Record<string,unknown>)[k],k)]));
  }
  const parsed=walk(emptyEstimators(),value,'estimators') as Estimators;
  const daily=(value as Estimators).install?.support?.daily;
  if(daily!==undefined){
    if(!Array.isArray(daily)||daily.length!==10)throw new Error('Support crew grid needs ten days.');
    parsed.install.support.daily=daily.map(row=>walk({installDays:0,dismantleDays:0,offDays:0},row,'support day') as SupportDay);
    for(const key of ['installDays','dismantleDays','offDays'] as const){
      if(Math.abs(daily.reduce((sum,row)=>sum+row[key],0)-parsed.install.support[key])>1e-8)throw new Error('Support day grid and person-day totals disagree.');
    }
  }
  if(parsed.version!==1) throw new Error('Unsupported estimator version.');
  if(parsed.travel.people.pm.useInstallDays) throw new Error('The PM has no linked installer day counts.');
  if(new Set(parsed.beMatrix.walls.map(w=>w.id)).size!==parsed.beMatrix.walls.length) throw new Error('Wall IDs must be unique.');
  return parsed;
}

export function calculateEstimators(quote: Pick<QuoteV27,'settings'|'lines'>, source: Estimators) {
  const e=parseEstimators(source), s=quote.settings, rates=e.travel.rates;
  const lineInputs: Record<string,Partial<Inputs>> = {}, warnings:string[]=[];
  function bind(id:string|null,type:string,inputs:Partial<Inputs>) {
    if(!id)return;
    const line=quote.lines.find(l=>l.id===id);
    if(!line || line.type!==type) throw new Error(`Estimator needs a ${type} item for its linked output.`);
    if(lineInputs[id])throw new Error('Two estimator outputs cannot target the same quote item.');
    lineInputs[id]=inputs;
  }
  const travel = PEOPLE.map(id=>{
    const p=e.travel.people[id];
    const days=p.useInstallDays && id!=='pm'?e.install[id]:p;
    const trips=!p.traveling?0:days.installDays>0&&days.dismantleDays>0&&!p.stays?2:1;
    const marketDays=p.traveling?days.installDays+days.dismantleDays+(p.stays?days.offDays:0):0;
    const travelDays=trips*p.daysPerTrip, roadDays=marketDays+travelDays;
    const hotelNights=p.traveling?marketDays+trips+p.hotelAdjustment:0;
    if(hotelNights<0)throw new Error(`${PERSON_LABELS[id]}: hotel adjustment makes nights negative.`);
    const cost=trips*(rates.airfare+rates.baggage)+hotelNights*rates.hotel+roadDays*(rates.perDiem+(p.roadBonus?rates.roadBonus:0));
    return {id,trips,marketDays,travelDays,roadDays,hotelNights,cost,shared:0,total:cost};
  });
  const roadDays=travel.reduce((sum,p)=>sum+p.roadDays,0);
  const shared=rates.vehicles*rates.vehicle*Math.max(...travel.map(p=>p.roadDays))+rates.other;
  for(const p of travel){p.shared=roadDays===0?0:p.roadDays/roadDays*shared;p.total=p.cost+p.shared;}
  const travelCost=travel.reduce((sum,p)=>sum+p.cost,0)+shared;
  if(roadDays===0&&shared>0)warnings.push('Travel has shared costs but no road days; these costs remain in the other-travel expense line.');
  bind(e.travel.leadLineId,'Travel & Expenses',{cost:travel[0].total});
  bind(e.travel.otherLineId,'Travel & Expenses',{cost:travelCost-travel[0].total});
  bind(e.travel.pmLineId,'Travel — Project Manager',{travelDays:travel[1].travelDays});
  const install=INSTALLERS.map(id=>{
    const p=e.install[id],travelDays=p.travelDaysOverride??travel.find(t=>t.id===id)!.travelDays;
    const dayRate=id==='lead'?s.leadDay:s.supportDay;
    const days=p.installDays+p.dismantleDays+p.offDays+travelDays;
    const billing=(p.installDays+p.dismantleDays+p.offDays*s.offFactor+travelDays*s.travelFactor)*dayRate;
    bind(p.lineId,'Installer Days',{siteDays:days,cost:billing});
    return {id,travelDays,days,billing};
  });
  const support=e.install.support;
  const supportDays=support.installDays+support.dismantleDays+support.offDays;
  const supportBilling=(support.installDays+support.dismantleDays+support.offDays*s.offFactor)*s.supportDay;
  bind(support.lineId,'Install Support Labor',{siteDays:supportDays,cost:supportBilling});
  const r=e.shipping.rates;
  if(r.mpg<=0||r.milesPerDay<=0)throw new Error('Shipping MPG and miles/day must be greater than zero.');
  const shipping=(['outbound','return'] as const).map(id=>{
    const leg=e.shipping[id];
    if(!['Our truck','Rented truck','LTL freight','FTL freight'].includes(leg.mode))throw new Error('Unknown shipping mode.');
    if(!['Lead installer','Shop driver','Carrier'].includes(leg.driver))throw new Error('Unknown shipping driver.');
    const carrier=leg.mode==='LTL freight'||leg.mode==='FTL freight';
    const days=!leg.enabled||carrier?0:Math.ceil(leg.miles/r.milesPerDay);
    const fuel=leg.enabled&&!carrier?leg.miles/r.mpg*r.fuel:0;
    const wear=leg.enabled&&leg.mode==='Our truck'?leg.miles*r.wear:0;
    const rental=leg.enabled&&leg.mode==='Rented truck'?days*r.rentalDay+leg.miles*r.rentalMile:0;
    const driver=leg.enabled&&!carrier&&leg.driver==='Shop driver'?days*r.driverDay:0;
    const freight=leg.enabled&&carrier?leg.carrierQuote:0;
    return {id,days,fuel,wear,rental,driver,freight,total:leg.enabled?fuel+wear+rental+driver+freight+leg.misc:0};
  });
  const shippingCost=shipping.reduce((sum,leg)=>sum+leg.total,0);
  bind(e.shipping.lineId,'Freight',{cost:shippingCost});
  const leadDrivingDays=shipping.reduce((sum,leg)=>sum+(e.shipping[leg.id].driver==='Lead installer'?leg.days:0),0);
  if(leadDrivingDays>0)warnings.push(`Lead installer drives ${leadDrivingDays} day(s). Include these in install travel days; shipping does not add or bill them automatically.`);
  const b=e.beMatrix;
  if(b.frameWidth<=0||b.frameHeight<=0)throw new Error('Frame width and height must be greater than zero.');
  const walls=b.walls.map(w=>{
    if(![0,1,2].includes(w.sides))throw new Error('SEG sides must be 0, 1 or 2.');
    const panels=Math.ceil(w.width/b.frameWidth)*Math.ceil(w.height/b.frameHeight);
    const sqft=w.sqftOverride??w.width*w.height*w.sides,rental=panels*b.frameRental;
    return {...w,panels,sqft,rental};
  });
  for(const id of new Set(walls.map(w=>w.lineId).filter((id):id is string=>id!==null))){
    const grouped=walls.filter(w=>w.lineId===id);
    bind(id,'beMatrix / SEG',{panels:grouped.reduce((n,w)=>n+w.panels,0),sqft:grouped.reduce((n,w)=>n+w.sqft,0),rental:grouped.reduce((n,w)=>n+w.rental,0)});
  }
  if(install.some(p=>p.billing>0&&!e.install[p.id].lineId)||supportBilling>0&&!support.lineId||shippingCost>0&&!e.shipping.lineId||travel[0].total>0&&!e.travel.leadLineId||travelCost-travel[0].total>0&&!e.travel.otherLineId||travel[1].travelDays>0&&!e.travel.pmLineId||walls.some(w=>(w.rental+w.sqft)>0&&!w.lineId))warnings.push('Some estimator outputs are not linked to quote items and are excluded from the quote total. Choose destination items below.');
  return {lineInputs,travel,travelCost,install,supportDays,supportBilling,shipping,shippingCost,leadDrivingDays,walls,warnings};
}
