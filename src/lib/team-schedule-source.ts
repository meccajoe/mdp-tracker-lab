import {capacityProject,type CapacityQuote,type RosterPerson} from './capacity';
import {emptyPlan,proposeProductionPlan} from './production-plan';
import {scheduleTeam,scheduleTeamWithOvertime,type TeamOptions,type TeamTask,type TeamResult} from './team-schedule';
import {validDate} from './quote-schedule';

/** All source hours remain visible, including unstaffed/unassigned trades. */
export function buildTeamSchedule(quotes:CapacityQuote[],roster:RosterPerson[],options:TeamOptions,allowAttention=false){
 const tasks:TeamTask[]=[],warnings:string[]=[],attention:TeamResult['unfilled']=[];
 const included=quotes.map(q=>capacityProject(q)).filter(p=>p.committed);
 for(const p of included){
  const taskStart=tasks.length;
  try{
  if(!p.document)throw Error(`${p.workspace}: quote unavailable.`);
  if(!validDate(p.schedule.buildStart)||!validDate(p.schedule.buildFinish))throw Error(`${p.workspace}: enter build dates before generating a team schedule.`);
  const plan=p.productionPlan??{...emptyPlan(),calendar:p.document.productionCalendar??emptyPlan().calendar};
  if(plan.status==='approved'&&plan.quoteVersion!==p.version)throw Error(`${p.workspace}: approved project schedule uses an older quote revision. Review and approve its current workback first.`);
  const proposal=proposeProductionPlan(p.document,roster,plan);
  if(proposal.warnings.some(w=>w.startsWith('Unresolved or cyclic')))throw Error(`${p.workspace}: resolve cyclic or missing task dependencies before assigning staff.`);
  const source=plan.status==='approved'?plan.tasks:proposal.tasks;
  if(plan.status!=='approved')warnings.push(...proposal.warnings.map(w=>`${p.workspace}: ${w}`));
  // Remaining-work overrides in capacity are aggregate; do not guess which item is complete.
  if(p.document.planning?.remainingShop!=null||Object.keys(p.document.planning?.remainingTrades??{}).length)throw Error(`${p.workspace}: move aggregate remaining-hour overrides to item task remaining hours before assigning people.`);
  if(!source.length&&p.shop>0)throw Error(`${p.workspace}: no schedulable tasks. Review the project schedule.`);
  for(const t of source){
   tasks.push({key:p.workspaceId+'|'+t.id,workspaceId:p.workspaceId,project:p.workspace,item:t.item,trade:t.trade,hours:t.hours,start:t.start||p.schedule.buildStart,finish:t.finish||p.schedule.buildFinish,deadline:p.schedule.buildFinish,fixed:plan.status==='approved'||t.locked,dailyLimit:plan.rules[t.id]?.dailyHours??Math.max(p.document.settings.shopDay||8,...t.daily.map(d=>d.hours)),expandCrew:plan.rules[t.id]?.dailyHours===undefined,predecessorLagDays:Object.fromEntries(t.predecessors.map(id=>[p.workspaceId+'|'+id,(plan.rules[t.id]?.lagDays??0)+(source.find(s=>s.id===id)?.stage==='cad'?plan.rampDays:0)])),predecessors:t.predecessors.map(id=>p.workspaceId+'|'+id),calendar:plan.calendar,completed:plan.actuals[t.id]?.completed??'',external:t.stage==='cad'});
  }
  }catch(error){
   if(!allowAttention)throw error;
   tasks.splice(taskStart);
   attention.push({taskKey:p.workspaceId+'|attention',project:p.workspace,item:'Project schedule',trade:'Shop work',hours:p.shop,reason:error instanceof Error?error.message:'Review this project’s dates and schedule.'});
  }
 }
 const result=(allowAttention?scheduleTeamWithOvertime:scheduleTeam)(tasks,roster.map(({id,name,primary,secondary,hours,active})=>({id,name,primary,secondary,hours,active})),options);
 return {...result,totalHours:result.totalHours+attention.reduce((sum,row)=>sum+row.hours,0),unfilled:[...result.unfilled,...attention],warnings:[...new Set([...warnings,...result.warnings])],projects:included.map(p=>({id:p.workspaceId,name:p.workspace,status:p.status}))};
}
