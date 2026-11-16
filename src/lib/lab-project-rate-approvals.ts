import {createHash} from 'node:crypto';
import type {ActivityCapture} from './lab-project-activity';
import {roundedCostSum,validateProjectCosting,type ProjectCostingPacket} from './lab-project-costing';

// Server-only, owner-approved Lab evidence. Source time and Production stay immutable.
export type LabRateApproval={id:string;workerId:number;canonicalName:string;allowedNames:string[];hourlyRate:number;effectiveStart:string;effectiveEnd:string|null;approvedBy:string;approvedAt:string;sourceLabel:string;sourceRefs:string[]};
const normalize=(name:string)=>name.trim().toLowerCase().replace(/\s+/g,' ');
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function applyLabRateApprovals(capture:ActivityCapture,source:ProjectCostingPacket,approvals:LabRateApproval[],resolvedAt:string):ProjectCostingPacket {
 validateProjectCosting(capture,source,source.activitySnapshotId,source.activitySourceSha256);
 if(!Array.isArray(approvals)||approvals.length>1000||!Number.isFinite(Date.parse(resolvedAt)))throw Error('Invalid Lab rate approvals.');
 for(const a of approvals){
  if(!a.id||!Number.isSafeInteger(a.workerId)||a.workerId<=0||!a.canonicalName||!Array.isArray(a.allowedNames)||!a.allowedNames.length||a.allowedNames.some(n=>typeof n!=='string'||!n.trim())||
   !Number.isFinite(a.hourlyRate)||a.hourlyRate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(a.effectiveStart)||!Number.isFinite(Date.parse(a.effectiveStart+'T12:00:00Z'))||
   (a.effectiveEnd!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(a.effectiveEnd)||!Number.isFinite(Date.parse(a.effectiveEnd+'T12:00:00Z'))||a.effectiveEnd<a.effectiveStart))||
   !a.approvedBy||!Number.isFinite(Date.parse(a.approvedAt))||!a.sourceLabel||!Array.isArray(a.sourceRefs)||!a.sourceRefs.length||a.sourceRefs.some(ref=>typeof ref!=='string'||!ref.trim()))throw Error('Invalid Lab rate approval.');
 }
 const used=new Set<string>();
 const rows=source.rows.map(row=>{
  // Later source approvals, exclusions and day rates take precedence. Only fill gaps.
  if(row.basis!=='missing')return row;
  const matches=approvals.filter(a=>a.workerId===row.workerId&&row.date>=a.effectiveStart&&(!a.effectiveEnd||row.date<=a.effectiveEnd));
  if(matches.length>1)throw Error('Conflicting Lab rate approvals.');
  const a=matches[0];if(!a)return row;
  if(!a.allowedNames.some(name=>normalize(name)===normalize(row.employeeName)))throw Error('Lab rate worker identity changed.');
  used.add(a.id);
  return {...row,normalizedName:normalize(a.canonicalName),basis:'hourly' as const,source:'approved_historical_payroll_rate',hourlyRate:a.hourlyRate,dailyRate:null,
   amount:(row.regHours+row.otHours)*a.hourlyRate,verifiedAt:null,
   approval:{id:a.id,approvedBy:a.approvedBy,approvedAt:a.approvedAt,effectiveStart:a.effectiveStart,effectiveEnd:a.effectiveEnd,sourceLabel:a.sourceLabel,sourceRefs:a.sourceRefs}};
 });
 if(!used.size)return source;
 const packet:ProjectCostingPacket={...source,resolvedAt,rows,
  labApproval:{sourceCostingSha256:digest(source),sourceExpected:source.expected,rateApprovalIds:[...used].sort()},
  expected:{...source.expected,knownCost:roundedCostSum(rows.flatMap(r=>r.amount===null?[]:[r.amount])),missingHours:roundedCostSum(rows.filter(r=>r.basis==='missing').flatMap(r=>[r.regHours,r.otHours]))}};
 validateProjectCosting(capture,packet,source.activitySnapshotId,source.activitySourceSha256);
 return packet;
}
