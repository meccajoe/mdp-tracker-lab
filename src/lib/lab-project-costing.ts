import type {ActivityCapture,ActivityLabor} from './lab-project-activity';

export type CostApproval={id:string;approvedBy:string;approvedAt:string;effectiveStart:string;effectiveEnd:string|null;importId?:string|null;sourceLabel?:string|null;sourceSha256?:string|null};
export type ApprovedLaborCost={
 entryId:string;employeeName:string;workerId:number|null;normalizedName:string;date:string;regHours:number;otHours:number;
 basis:'hourly'|'daily'|'excluded'|'missing';source:string|null;hourlyRate:number|null;dailyRate:number|null;amount:number|null;
 verifiedAt:string|null;approval:CostApproval|null;
};
export type ProjectCostingPacket={
 version:1;activitySnapshotId:string;activitySourceSha256:string;sourceProjectId:string;jobNumber:string;dealId:string;
 resolvedAt:string;sourceView:'public.project_labor_reconciliation_summary';sourceViewSha256:string;
 expected:{rows:number;hours:number;knownCost:number;missingHours:number;excludedHours:number};rows:ApprovedLaborCost[];
};
const hourlySources=new Set(['qbo_time_users','qbo_time_users_matched','payroll_rate_sheet','fixed_design_rate','approved_contractor_rate','approved_historical_payroll_rate']);
const rawSources=new Set(['qbo_time_users','qbo_time_users_matched']);
const close=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<0.000001;
// Sum the source decimal values exactly; binary addition can lose a half cent.
export function roundedCostSum(values:number[],places=2){
 const parts=values.map(value=>{
  if(!Number.isFinite(value)||value<0)throw Error('Invalid nonnegative cost amount.');
  const [coefficient,exponent='0']=value.toString().toLowerCase().split('e'),[whole,fraction='']=coefficient.split('.');
  let digits=BigInt(whole+fraction),scale=fraction.length-Number(exponent);
  if(scale<0){digits*=BigInt(10)**BigInt(-scale);scale=0;}
  return {digits,scale};
 });
 const scale=Math.max(places,...parts.map(p=>p.scale));
 const total=parts.reduce((sum,p)=>sum+p.digits*BigInt(10)**BigInt(scale-p.scale),BigInt(0));
 const divisor=BigInt(10)**BigInt(scale-places),result=(total+divisor/BigInt(2))/divisor;
 return Number(result)/10**places;
}
const date=(v:string)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'));
const timestamp=(v:string|null)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const hash=(v:string)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function approvedForDate(row:ApprovedLaborCost){
 const a=row.approval;
 return !!a?.id&&!!a.approvedBy&&timestamp(a.approvedAt)&&date(a.effectiveStart)&&(!a.effectiveEnd||date(a.effectiveEnd))&&row.date>=a.effectiveStart&&(!a.effectiveEnd||row.date<=a.effectiveEnd);
}
export function validateProjectCosting(capture:ActivityCapture,packet:ProjectCostingPacket,snapshotId:string,sourceHash:string){
 if(packet.version!==1||packet.activitySnapshotId!==snapshotId||packet.activitySourceSha256!==sourceHash||!hash(sourceHash)||
  packet.sourceProjectId!==capture.project.id||packet.jobNumber!==capture.project.job_number||packet.dealId!==capture.project.hubspot_deal_id||
  !timestamp(packet.resolvedAt)||packet.sourceView!=='public.project_labor_reconciliation_summary'||!hash(packet.sourceViewSha256)||!Array.isArray(packet.rows))throw Error('Cost evidence is not bound to this activity snapshot.');
 const original=new Map(capture.labor.map(row=>[row.qbo_entry_id,row]));
 if(packet.rows.length!==original.size||new Set(packet.rows.map(r=>r.entryId)).size!==original.size)throw Error('Incomplete or duplicate cost evidence.');
 const hours:number[]=[],cost:number[]=[],missing:number[]=[],excluded:number[]=[];
 const days=new Map<string,{rate:number;amount:number;charges:number}>();
 for(const row of packet.rows){
  const raw=original.get(row.entryId);
  if(!raw||raw.employee_name!==row.employeeName||raw.date!==row.date||!close(raw.reg_hours,row.regHours)||!close(raw.ot_hours,row.otHours)||!date(row.date)||!row.normalizedName)throw Error('Time entry changed since the activity capture.');
  const h=row.regHours+row.otHours;hours.push(row.regHours,row.otHours);
  if(row.basis==='missing'){
   if(row.source!==null||row.amount!==null||row.hourlyRate!==null||row.dailyRate!==null||row.approval!==null)throw Error('Missing cost was assigned an unsupported value.');
   missing.push(row.regHours,row.otHours);continue;
  }
  if(!Number.isFinite(row.amount)||row.amount!<0)throw Error('Invalid approved labor amount.');
  if(row.basis==='hourly'){
   if(!hourlySources.has(row.source??'')||!(row.hourlyRate!>0)||row.dailyRate!==null||!close(row.amount!,h*row.hourlyRate!))throw Error('Hourly cost does not reconcile.');
   if(rawSources.has(row.source!)){if(!timestamp(row.verifiedAt))throw Error('Time rate lacks verification evidence.');}
   else if(!approvedForDate(row))throw Error('Cost approval does not cover this work date.');
   if(row.source==='payroll_rate_sheet'&&(!row.approval?.importId||!hash(row.approval.sourceSha256??'')))throw Error('Payroll import provenance missing.');
  }else if(row.basis==='daily'){
   if(row.source!=='approved_daily_rate'||!approvedForDate(row)||!(row.dailyRate!>0)||row.hourlyRate!==null||(!close(row.amount!,0)&&!close(row.amount!,row.dailyRate!)))throw Error('Invalid day-rate evidence.');
   const key=row.normalizedName+'|'+row.date,prior=days.get(key)??{rate:row.dailyRate!,amount:0,charges:0};
   if(!close(prior.rate,row.dailyRate!))throw Error('Conflicting day rates.');
   prior.amount+=row.amount!;if(row.amount!>0)prior.charges++;days.set(key,prior);
  }else if(row.basis==='excluded'){
   if(row.source!=='salary_below_gross_profit'||!approvedForDate(row)||row.amount!==0||row.hourlyRate!==null||row.dailyRate!==null)throw Error('Invalid salary exclusion.');
   excluded.push(row.regHours,row.otHours);
  }else throw Error('Unsupported costing basis.');
  cost.push(row.amount!);
 }
 for(const day of days.values())if(day.charges!==1||!close(day.amount,day.rate))throw Error('Day rate must be charged once per worker/project/date.');
 const e=packet.expected;
 if(e.rows!==packet.rows.length||!close(e.hours,roundedCostSum(hours))||!close(e.knownCost,roundedCostSum(cost))||!close(e.missingHours,roundedCostSum(missing))||!close(e.excludedHours,roundedCostSum(excluded)))throw Error('Cost evidence does not match the source reconciliation.');
}
export function attachProjectCosting(capture:ActivityCapture,packet:ProjectCostingPacket|null|undefined,snapshotId:string,sourceHash:string):ActivityCapture{
 // Evidence must come from its separate server-written, snapshot-bound audit row.
 const clean={...capture,costing:undefined,labor:capture.labor.map(({approved_cost,...raw})=>raw)};
 if(!packet)return clean;
 validateProjectCosting(clean,packet,snapshotId,sourceHash);
 const byId=new Map(packet.rows.map(row=>[row.entryId,row]));
 return {...clean,costing:{resolvedAt:packet.resolvedAt,sourceView:packet.sourceView,sourceViewSha256:packet.sourceViewSha256},labor:clean.labor.map(row=>({...row,approved_cost:byId.get(row.qbo_entry_id)!}))};
}
export function activityLaborCost(row:ActivityLabor):number|null{
 if(row.approved_cost)return row.approved_cost.amount;
 return row.hourly_rate!=null&&row.hourly_rate>0&&rawSources.has(row.rate_source??'')?(row.reg_hours+row.ot_hours)*row.hourly_rate:null;
}
export function activityCostBasis(row:ActivityLabor){return row.approved_cost?.basis??(activityLaborCost(row)==null?'missing':'hourly');}
export function activityCostRate(row:ActivityLabor):number|null{return row.approved_cost?(row.approved_cost.basis==='daily'?row.approved_cost.dailyRate:row.approved_cost.hourlyRate):row.hourly_rate;}
export function activityCostSource(row:ActivityLabor){return row.approved_cost?.source??row.rate_source;}
