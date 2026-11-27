export type WorkforceCandidate = {quoteLineId:string;name:string;hoursAllowed:number};
export type WorkforceLink = {quoteLineId:string;packageId:string;workforceItemId:number};
export type WorkforceEntry = {id:string;packageId:string;kind:'item'|'service'|'group';label:string;hours:number};
export type WorkforceEvidence = {
 workspace_id:string;workbook_revision:number;
 links:WorkforceLink[];entries:WorkforceEntry[];
};

export function summarizeWorkforceHandoff(
 evidence:WorkforceEvidence,candidates:WorkforceCandidate[],
 labor:{qbo_entry_id:string;reg_hours:number;ot_hours:number}[],
){
 const activeItems=new Map(candidates.map(item=>[item.quoteLineId,item]));
 const byPackage=new Map(evidence.links.map(link=>[link.packageId,link]));
 const byEntry=new Map(evidence.entries.map(entry=>[entry.id,entry]));
 const linked=new Map<string,WorkforceCandidate&{workforceItemId:number;recorded:number}>();
 for(const link of evidence.links){
  const item=activeItems.get(link.quoteLineId);
  if(item)linked.set(link.quoteLineId,{...item,workforceItemId:link.workforceItemId,recorded:0});
 }
 const groups=new Map<string,{label:string;kind:'service'|'group';hours:number}>();
 let unallocated=0,total=0;
 for(const record of labor){
  const hours=record.reg_hours+record.ot_hours;
  total+=hours;
  const entry=byEntry.get(record.qbo_entry_id);
  if(!entry||Math.abs(entry.hours-hours)>1e-8){unallocated+=hours;continue;}
  if(entry.kind==='item'){
   const link=byPackage.get(entry.packageId);
   const item=link&&linked.get(link.quoteLineId);
   if(item){item.recorded+=hours;continue;}
  }
  const kind=entry.kind==='service'?'service':'group';
  const group=groups.get(entry.packageId)??{label:entry.label,kind,hours:0};
  group.hours+=hours;
  groups.set(entry.packageId,group);
 }
 return {items:[...linked.values()],groups:[...groups.values()],unallocated,total};
}
