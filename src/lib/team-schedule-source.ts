import {capacityProject,type CapacityQuote,type RosterPerson} from './capacity';
import {emptyPlan,proposeProductionPlan} from './production-plan';
import {scheduleTeam,type TeamOptions,type TeamTask} from './team-schedule';
import {validDate} from './quote-schedule';

/** All source hours remain visible, including unstaffed/unassigned trades. */
export function buildTeamSchedule(quotes:CapacityQuote[],roster:RosterPerson[],options:TeamOptions){
 const tasks:TeamTask[]=[],warnings:string[]=[];
 const included=quotes.map(q=>capacityProject(q)).filter(p=>p.committed);
 for(const p of included){
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
   tasks.push({key:p.workspaceId+'|'+t.id,workspaceId:p.workspaceId,project:p.workspace,item:t.item,trade:t.trade,hours:t.hours,start:t.start||p.schedule.buildStart,finish:t.finish||p.schedule.buildFinish,deadline:p.schedule.buildFinish,fixed:plan.status==='approved'||t.locked,dailyLimit:plan.rules[t.id]?.dailyHours??Math.max(p.document.settings.shopDay||8,...t.daily.map(d=>d.hours)),lagDays:(plan.rules[t.id]?.lagDays??0)+(t.predecessors.some(id=>source.find(s=>s.id===id)?.stage==='cad')?plan.rampDays:0),predecessors:t.predecessors.map(id=>p.workspaceId+'|'+id),calendar:plan.calendar,completed:plan.actuals[t.id]?.completed??'',external:t.stage==='cad'});
  }
 }
 const result=scheduleTeam(tasks,roster.map(({id,name,primary,secondary,hours,active})=>({id,name,primary,secondary,hours,active})),options);
 return {...result,warnings:[...new Set([...warnings,...result.warnings])],projects:included.map(p=>({id:p.workspaceId,name:p.workspace,status:p.status}))};
}
