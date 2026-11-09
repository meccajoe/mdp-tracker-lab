import type {PerDiemRecipients} from './per-diem-recipients';
export type TravelAdjustments=Partial<Record<keyof PerDiemRecipients,{rate:number;reason:string}>>;
export function parseTravelAdjustments(value:unknown):TravelAdjustments{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid travel adjustments.');
 const result:TravelAdjustments={};
 for(const [role,raw] of Object.entries(value)){
  const v=raw as {rate:unknown;reason:unknown};
  if(!['lead','pm','second','third'].includes(role)||!v||typeof v.rate!=='number'||!Number.isFinite(v.rate)||v.rate<0||v.rate>10000||typeof v.reason!=='string'||!v.reason.trim()||v.reason.length>300||/[\u0000-\u001f\u007f]/.test(v.reason))throw Error('Enter an increased travel rate and a reason (up to 300 characters).');
  result[role as keyof PerDiemRecipients]={rate:v.rate,reason:v.reason.trim()};
 }
 return result;
}
