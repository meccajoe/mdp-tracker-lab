import {paceProjectTasks} from './team-pacing';
import {projectPreparation} from './project-preparation';
import {dateString,dayNumber,capacityProject,type CapacityQuote,type RosterPerson} from './capacity';
import {emptyPlan,proposeProductionPlan} from './production-plan';
import {scheduleTeam,scheduleTeamWithOvertime,type TeamOptions,type TeamTask,type TeamResult} from './team-schedule';
import {validDate} from './quote-schedule';
import {productionDays} from './production-calendar';

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
  const stale=Boolean(p.schedule.projectStartOverride)&&plan.status==='approved'&&plan.quoteVersion!==p.version;
  if(plan.status==='approved'&&plan.quoteVersion!==p.version&&!stale)throw Error(`${p.workspace}: approved project schedule uses an older quote revision. Review and approve its current workback first.`);
  if(stale)warnings.push(`${p.workspace}: live schedule recalculated from updated quote dates; saved approved plan remains available for review.`);
  const proposal=proposeProductionPlan({...p.document,schedule:p.schedule},roster,plan);
  if(proposal.warnings.some(w=>w.startsWith('Unresolved or cyclic')))throw Error(`${p.workspace}: resolve cyclic or missing task dependencies before assigning staff.`);
  const source=plan.status==='approved'&&!stale?plan.tasks:proposal.tasks;
  if(plan.status!=='approved')warnings.push(...proposal.warnings.map(w=>`${p.workspace}: ${w}`));
  // Remaining-work overrides in capacity are aggregate; do not guess which item is complete.
  if(p.document.planning?.remainingShop!=null||Object.keys(p.document.planning?.remainingTrades??{}).length)throw Error(`${p.workspace}: move aggregate remaining-hour overrides to item task remaining hours before assigning people.`);
  if(!source.length&&p.shop>0)throw Error(`${p.workspace}: no schedulable tasks. Review the project schedule.`);
  const recoveryDays=productionDays(p.schedule.buildStart,dateString(dayNumber(p.schedule.buildStart)+1095),plan.calendar);
  const rampStart=recoveryDays[plan.rampDays]===undefined?p.schedule.buildFinish:dateString(recoveryDays[plan.rampDays]);
  const phases=projectPreparation(p.schedule.buildStart,p.schedule.buildFinish,p.demand.design,plan.calendar),cad=phases.find(p=>p.kind==='CAD');
  if(allowAttention&&!phases.length)warnings.push(`${p.workspace}: no working days remain between Project Start and Project Finish. Review the finish date and project calendar; CAD/turnover cannot be placed.`);
  if(allowAttention&&plan.status==='approved')warnings.push(`${p.workspace}: Project turnover includes CAD, purchasing and scope review (maximum 20%); approved dates remain saved for review. Production must wait for turnover.`);
  const prepStart=phases[0]?.start??p.schedule.buildStart;
  const buildDays=productionDays(prepStart,p.schedule.buildFinish,plan.calendar);
  // The named shop scheduler uses whole days. Start after the preparation window,
  // keeping approved/locked plans authoritative and historical stored data unchanged.
  const readyIndex=Math.ceil((phases.find(phase=>phase.kind==='Turnover')?.workdays??0)-1e-9),prepReady=!phases.length||buildDays[readyIndex]===undefined?dateString(dayNumber(p.schedule.buildFinish)+1):dateString(buildDays[readyIndex]),readyDate=prepReady>p.schedule.buildStart?prepReady:p.schedule.buildStart;
  if(allowAttention&&phases.length)warnings.push(`${p.workspace}: readiness review — production is planned from ${readyDate}. Confirm CAD, purchasing and scope review are ready; completion is assumed for scheduling, not recorded as actual.`);
  for(const original of source){
   let t=allowAttention&&(plan.status!=='approved'||stale)&&!original.locked
    ?original.stage==='cad'&&cad?{...original,start:cad.start,finish:cad.finish}
    :{...original,start:plan.rules[original.id]?.start&&plan.rules[original.id].start!>readyDate?plan.rules[original.id].start!:readyDate}:original;

   if(allowAttention&&t.stage!=='cad'&&t.start<readyDate){
    if(plan.status==='approved'||t.locked)warnings.push(`${p.workspace} / ${t.item}: saved dates overlap project turnover. Live assignments wait until ${readyDate}; review the saved plan.`);
    t={...t,start:readyDate};
   }
   tasks.push({key:p.workspaceId+'|'+t.id,workspaceId:p.workspaceId,project:p.workspace,item:t.item,trade:t.trade,hours:t.hours,start:t.start||p.schedule.buildStart,finish:t.finish||p.schedule.buildFinish,deadline:p.schedule.buildFinish,fixed:(plan.status==='approved'&&!stale)||t.locked,dailyLimit:plan.rules[t.id]?.dailyHours??Math.max(p.document.settings.shopDay||8,...t.daily.map(d=>d.hours)),recoveryStart:plan.rules[t.id]?.start&&plan.rules[t.id].start!>(allowAttention?readyDate:rampStart)?plan.rules[t.id].start:(allowAttention?readyDate:rampStart),expandCrew:plan.rules[t.id]?.dailyHours===undefined,predecessorLagDays:Object.fromEntries(t.predecessors.map(id=>[p.workspaceId+'|'+id,(plan.rules[t.id]?.lagDays??0)+(source.find(s=>s.id===id)?.stage==='cad'&&!allowAttention?plan.rampDays:0)])),predecessors:t.predecessors.map(id=>p.workspaceId+'|'+id),calendar:plan.calendar,completed:plan.actuals[t.id]?.completed??'',external:t.stage==='cad'});
  }
  if(allowAttention){
   const paced=paceProjectTasks(tasks.slice(taskStart));
   tasks.splice(taskStart,tasks.length-taskStart,...paced);
  }
  }catch(error){
   if(!allowAttention)throw error;
   tasks.splice(taskStart);
   attention.push({taskKey:p.workspaceId+'|attention',project:p.workspace,item:'Project schedule',trade:'Shop work',hours:p.shop,reason:error instanceof Error?error.message:'Review this project’s dates and schedule.'});
  }
 }
 const result=(allowAttention?scheduleTeamWithOvertime:scheduleTeam)(tasks,roster.map(({id,name,primary,secondary,hours,active})=>({id,name,primary,secondary,hours,active})),options);
 return {...result,preparation:included.flatMap(p=>projectPreparation(p.schedule.buildStart,p.schedule.buildFinish,p.demand.design,p.productionPlan?.calendar??p.document?.productionCalendar??emptyPlan().calendar).map(phase=>({...phase,workspaceId:p.workspaceId,project:p.workspace}))),totalHours:result.totalHours+attention.reduce((sum,row)=>sum+row.hours,0),unfilled:[...result.unfilled,...attention],warnings:[...new Set([...warnings,...result.warnings])],projects:included.map(p=>({id:p.workspaceId,name:p.workspace,status:p.status,start:p.schedule.buildStart,finish:p.schedule.buildFinish}))};
}
