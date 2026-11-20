/** Storage Pricing — 625 sq ft Non-Stackable.xlsx, Untitled!A4:E30.
 * Source contains cached values, not formulas. Calculations below reproduce them.
 * Rates are quote snapshots; opening an older quote does not enable storage.
 */
export type StorageEstimate = {
  version: 1;
  billing?: 'monthly' | 'contract';
  method: 1 | 2 | 3;
  lineId: string | null;
  footprint: number;
  itemHeight: number;
  months: number;
  settings: {
    squareFootRate: number;
    cubicFootRate: number;
    floorToCeilingRate: number;
    ceilingHeight: number;
    nonStackableMultiplier: number;
  };
};

export function defaultStorage(): StorageEstimate {
  return {version:1,billing:'monthly',method:1,lineId:null,footprint:0,itemHeight:4,months:12,settings:{
    squareFootRate:2,cubicFootRate:.45,floorToCeilingRate:.45,ceilingHeight:20,nonStackableMultiplier:2,
  }};
}

export function parseStorage(value: unknown): StorageEstimate {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid storage estimate.');
  const v=value as Record<string,unknown>;
  if(v.billing!==undefined&&v.billing!=='monthly'&&v.billing!=='contract')throw new Error('Invalid storage billing basis.');
  if(v.version!==1||![1,2,3].includes(v.method as number))throw new Error('Invalid storage method.');
  if(v.lineId!==null&&(typeof v.lineId!=='string'||!v.lineId||v.lineId.length>200))throw new Error('Invalid storage quote item.');
  if(!v.settings||typeof v.settings!=='object'||Array.isArray(v.settings))throw new Error('Storage settings are required.');
  const settings=v.settings as Record<string,unknown>;
  const number=(x:unknown,label:string,max=1e6)=>{
    if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>max)throw new Error(`${label} must be between 0 and ${max}.`);
    return x;
  };
  const result:StorageEstimate={version:1,...(v.billing!==undefined?{billing:v.billing as 'monthly'|'contract'}:{}),method:v.method as 1|2|3,lineId:v.lineId as string|null,
    footprint:number(v.footprint,'Storage footprint'),itemHeight:number(v.itemHeight,'Item height',1000),
    months:number(v.months,'Storage months',1200),settings:{
      squareFootRate:number(settings.squareFootRate,'Square foot rate'),
      cubicFootRate:number(settings.cubicFootRate,'Cubic foot rate'),
      floorToCeilingRate:number(settings.floorToCeilingRate,'Floor-to-ceiling rate'),
      ceilingHeight:number(settings.ceilingHeight,'Ceiling height',1000),
      nonStackableMultiplier:number(settings.nonStackableMultiplier,'Non-stackable multiplier',100),
    }};
  if(!result.months)throw new Error('Storage term must be greater than zero.');
  return result;
}

export function calculateStorage(value: StorageEstimate) {
  const s=parseStorage(value),r=s.settings;
  const rawVolume=s.footprint*s.itemHeight;
  const billableVolume=rawVolume*r.nonStackableMultiplier;
  const floorToCeilingVolume=s.footprint*r.ceilingHeight;
  const monthly=[s.footprint*r.squareFootRate,billableVolume*r.cubicFootRate,floorToCeilingVolume*r.floorToCeilingRate];
  const methods=monthly.map((price,index)=>({method:index+1,monthly:price,annual:price*12,contract:price*s.months}));
  const selected=methods[s.method-1];
  return {rawVolume,billableVolume,floorToCeilingVolume,methods,selected,quotedAmount:s.billing==='monthly'?selected.monthly:selected.contract};
}
