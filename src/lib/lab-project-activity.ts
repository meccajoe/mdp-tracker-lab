import { getLaborWorkGroup } from './labor-service-item';

export type ActivityExpense = {
 id:string; date:string; category:string|null; vendor:string|null; amount:number;
 amount_pending:boolean|null; flagged:boolean|null; flag_note:string|null;
 notes:string|null; source:string|null; external_id:string|null;
};
export type ActivityLabor = {
 qbo_entry_id:string; employee_name:string; date:string; service_item:string|null;
 reg_hours:number; ot_hours:number; hourly_rate:number|null; rate_source:string|null;
 rate_verified_at:string|null;
};
export type ActivityCapture = {
 version:1; source:'production-tracker'; capturedAt:string;
 project:{id:string; name:string; job_number:string; hubspot_deal_id:string;
  contract_amount:number; budget_hrs:number|null; budget_materials:number|null;
  budget_design:number|null; budget_id_labor:number|null};
 expenses:ActivityExpense[]; labor:ActivityLabor[]; manualLabor:unknown[]; manualActuals:unknown[];
};
export function hasActivityRate(row:ActivityLabor) {
 return row.hourly_rate!=null && row.hourly_rate>0 && ['qbo_time_users','qbo_time_users_matched'].includes(row.rate_source??'');
}
export function summarizeProjectActivity(capture:ActivityCapture) {
 const groups={design:{hours:0,cost:0,missingHours:0},shop:{hours:0,cost:0,missingHours:0},install:{hours:0,cost:0,missingHours:0},dismantle:{hours:0,cost:0,missingHours:0},unclassified:{hours:0,cost:0,missingHours:0}};
 let hours=0,knownCost=0,missingHours=0,missingEntries=0;
 for(const row of capture.labor){
  const h=row.reg_hours+row.ot_hours,group=groups[getLaborWorkGroup(row.service_item)];
  hours+=h;group.hours+=h;
  if(hasActivityRate(row)){const cost=h*row.hourly_rate!;knownCost+=cost;group.cost+=cost;}
  else if(h>0){missingHours+=h;missingEntries++;group.missingHours+=h;}
 }
 const expenseCategories:Record<string,number>={};let expenses=0,pendingExpenses=0;
 for(const row of capture.expenses){expenses+=row.amount;const category=row.category||'Uncategorized';expenseCategories[category]=(expenseCategories[category]??0)+row.amount;if(row.amount_pending)pendingExpenses+=row.amount;}
 return {hours,knownCost,missingHours,missingEntries,complete:missingEntries===0,expenses,pendingExpenses,expenseCategories,groups};
}

// Reject incomplete captures rather than silently dropping unsupported records.
export function validateActivityCapture(value:unknown):asserts value is ActivityCapture {
 const c=value as ActivityCapture;
 if(c?.version!==1||c.source!=='production-tracker'||!Number.isFinite(Date.parse(c.capturedAt))||
  !c.project?.id||!c.project.job_number||!c.project.hubspot_deal_id||
  !Array.isArray(c.expenses)||!Array.isArray(c.labor)||!Array.isArray(c.manualLabor)||!Array.isArray(c.manualActuals))throw Error('Invalid activity capture.');
 if(c.manualLabor.length||c.manualActuals.length)throw Error('Manual labor or actual adjustments require reconciliation before import.');
 const unique=(ids:string[])=>ids.every(id=>typeof id==='string'&&id.length>0)&&new Set(ids).size===ids.length;
 if(!unique(c.expenses.map(r=>r.id))||!unique(c.labor.map(r=>r.qbo_entry_id)))throw Error('Duplicate or missing activity source ID.');
 if(c.expenses.some(r=>!Number.isFinite(r.amount)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)))throw Error('Invalid expense amount or date.');
 if(c.labor.some(r=>!r.qbo_entry_id.startsWith('ts_')||!Number.isFinite(r.reg_hours)||r.reg_hours<0||!Number.isFinite(r.ot_hours)||r.ot_hours<0||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||(r.hourly_rate!=null&&(!Number.isFinite(r.hourly_rate)||r.hourly_rate<0))))throw Error('Invalid canonical labor record.');
}
