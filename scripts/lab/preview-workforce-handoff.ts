// Usage: node --import tsx scripts/lab/preview-workforce-handoff.ts <job-scoped-export.json>
import {readFileSync} from 'node:fs';

type QuoteItem = {quoteLineId:string;name:string};
type WorkforceItem = {id:number;packageId:string;name:string;active:boolean};
type CanonicalEntry = {id:string;hours:number};
type TimeEntry = {id:string;packageId:string|null;label:string;seconds:number;deleted:boolean;running:boolean};
type Export = {
 lab:{job:string;revision:number;candidates:QuoteItem[]};
 workforce:{job:string;jobcode:number;items:WorkforceItem[];canonical:CanonicalEntry[];time:TimeEntry[]};
};

function indexed<Row,Key>(rows:Row[],keyOf:(row:Row)=>Key){
 const index = new Map<Key,Row>();
 for (const row of rows) {
  const key=keyOf(row);
  if (!key || index.has(key)) throw Error('Missing or duplicate source identity');
  index.set(key,row);
 }
 return index;
}
const normalize=(name:string)=>name.trim().replace(/\s+/g,' ').toLowerCase();

function preview({lab,workforce}:Export){
 if(!/^\d+$/.test(lab.job)||lab.job!==workforce.job||!Number.isSafeInteger(lab.revision)||
    lab.revision<1||!Number.isSafeInteger(workforce.jobcode)||workforce.jobcode<1) {
  throw Error('Lab and Workforce project identity must agree');
 }
 const candidates=indexed(lab.candidates,row=>row.quoteLineId);
 const packages=indexed(workforce.items,item=>item.packageId);
 indexed(workforce.items,item=>item.id);
 const time=indexed(workforce.time,row=>row.id);
 const canonical=indexed(workforce.canonical,row=>row.id);
 if(workforce.time.some(row=>!Number.isSafeInteger(row.seconds)||row.seconds<0||
   typeof row.deleted!=='boolean'||typeof row.running!=='boolean')||
   workforce.canonical.some(row=>!Number.isFinite(row.hours)||row.hours<0)) {
  throw Error('Invalid time record');
 }
 const links=new Map<string,{quoteLineId:string;name:string;workforceItemId:number;canonicalHours:number}>();
 const review=[];
 for(const item of candidates.values()){
  const name=normalize(item.name);
  const matching=workforce.items.filter(row=>normalize(row.name)===name);
  const duplicateQuoteName=lab.candidates.filter(row=>normalize(row.name)===name).length!==1;
  if(!name||duplicateQuoteName||matching.length!==1||!matching[0]?.active){
   review.push({quoteLineId:item.quoteLineId,name:item.name,
    reason:!name?'missing name':duplicateQuoteName||matching.length>1?'ambiguous name':matching.length===1?'inactive item':'no exact match'});
   continue;
  }
  const match=matching[0];
  links.set(match.packageId,{quoteLineId:item.quoteLineId,name:item.name,workforceItemId:match.id,canonicalHours:0});
 }
 const unallocated=new Map<string,{label:string;entries:number;canonicalHours:number}>();
 const differences:{id:string;reason:string;canonicalHours:number|null;workforceHours:number|null}[]=[];
 let total=0,allocated=0;
 for(const row of canonical.values()){
  total+=row.hours;
  const entry=time.get(row.id);
  const active=entry&&!entry.deleted&&!entry.running;
  const link=active&&entry.packageId?links.get(entry.packageId):undefined;
  const hours=entry?entry.seconds/3600:null;
  if(!active||Math.abs(row.hours-hours!)>0.01) differences.push({id:row.id,
   reason:!entry?'canonical only':entry.deleted?'deleted in Workforce':entry.running?'running in Workforce':'duration mismatch',
   canonicalHours:row.hours,workforceHours:hours});
  if(link){
   link.canonicalHours+=row.hours;
   allocated+=row.hours;
   continue;
  }
  const key=active?(entry.packageId??'label:'+entry.label):'unverified';
  const label=active?(packages.get(entry.packageId??'')?.name??(entry.label||'Unlabeled time')):'No finished Workforce match';
  const group=unallocated.get(key)??{label,entries:0,canonicalHours:0};
  group.entries++;group.canonicalHours+=row.hours;
  unallocated.set(key,group);
 }
 for(const row of time.values())if(!row.deleted&&!row.running&&!canonical.has(row.id)){
  differences.push({id:row.id,reason:'Workforce only',canonicalHours:null,workforceHours:row.seconds/3600});
 }
 return {job:lab.job,revision:lab.revision,jobcode:workforce.jobcode,links:[...links.values()],review,
  unallocated:[...unallocated.values()],differences,totalCanonicalHours:total,allocatedCanonicalHours:allocated,
  unallocatedCanonicalHours:total-allocated};
}

const file=process.argv[2];
if(!file)throw Error('Provide a job-scoped read-only export');
console.log(JSON.stringify(preview(JSON.parse(readFileSync(file,'utf8'))),null,2));
