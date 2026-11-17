import type {ActivityExpense,ActivityLabor} from './lab-project-activity';
import {activityCostBasis,activityCostRate,activityLaborCost} from './lab-project-costing';
export type ActivitySort={column:number;direction:'asc'|'desc'};
export const expenseColumns=['Date','Vendor / notes','Category','Source','Amount','Review'];
export const laborColumns=['Date','Person','Work','Regular hours','OT hours','Approved rate / basis','Direct labor cost'];
const text=new Intl.Collator('en-US',{numeric:true,sensitivity:'base'});
type Value=string|number|null;
function compare(a:Value,b:Value,direction:ActivitySort['direction']){
 if(a===null)return b===null?0:1;
 if(b===null)return -1;
 const result=typeof a==='number'&&typeof b==='number'?a-b:text.compare(String(a),String(b));
 return direction==='asc'?result:-result;
}
function sorted<T>(rows:T[],sort:ActivitySort,values:(row:T)=>Value[]){
 return rows.map((row,index)=>({row,index})).sort((a,b)=>compare(values(a.row)[sort.column]??null,values(b.row)[sort.column]??null,sort.direction)||a.index-b.index).map(({row})=>row);
}
export function sortExpenses(rows:ActivityExpense[],sort:ActivitySort){
 return sorted(rows,sort,row=>[row.date,[row.vendor||'Not recorded',row.notes||''].join(' '),row.category||'Uncategorized',row.source==='billcom'?'BILL':row.source||'Not recorded',row.amount,[row.amount_pending?'Amount pending':'Confirmed',row.flagged?`Flagged: ${row.flag_note||'Review required'}`:''].join(' ')]);
}
export function sortLabor(rows:ActivityLabor[],sort:ActivitySort){
 return sorted(rows,sort,row=>[row.date,row.employee_name,row.service_item||'Unclassified',row.reg_hours,row.ot_hours,activityCostBasis(row)==='missing'?null:activityCostBasis(row)==='excluded'?'Excluded from direct cost':activityCostRate(row),activityLaborCost(row)]);
}
