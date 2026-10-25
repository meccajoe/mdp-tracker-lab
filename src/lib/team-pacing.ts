import type {TeamTask} from './team-schedule';
import {productionDays} from './production-calendar';
import {dateString} from './capacity';

/** Soft production windows, weighted by quoted work and its dependency chain.
 * CAD/turnover and explicit rules remain hard constraints. No quote is modified.
 * Terminal tasks reach one working day before the deadline; recovery may use the buffer.
 */
export function paceProjectTasks(tasks:TeamTask[]):TeamTask[]{
 const work=tasks.filter(t=>!t.external&&!t.completed&&t.hours>0);
 if(!work.length||work.some(t=>t.fixed))return tasks;
 const byKey=new Map(work.map(t=>[t.key,t])),early=new Map<string,number>(),tail=new Map<string,number>();
 const duration=(t:TeamTask)=>Math.max(1,Math.ceil(t.hours/t.dailyLimit));
 const pending=[...work],ordered:TeamTask[]=[];
 while(pending.length){
  const i=pending.findIndex(t=>t.predecessors.every(key=>!byKey.has(key)||early.has(key)));
  if(i<0)return tasks;
  const t=pending.splice(i,1)[0];
  early.set(t.key,Math.max(0,...t.predecessors.filter(key=>byKey.has(key)).map(key=>early.get(key)!+duration(byKey.get(key)!)+(t.predecessorLagDays?.[key]??t.lagDays??0))));
  ordered.push(t);
 }
 const length=Math.max(...work.map(t=>early.get(t.key)!+duration(t)));
 for(const t of [...ordered].reverse())tail.set(t.key,Math.max(0,...work.filter(s=>s.predecessors.includes(t.key)).map(s=>duration(s)+tail.get(s.key)!+(s.predecessorLagDays?.[t.key]??s.lagDays??0))));
 const start=work.map(t=>t.start).sort()[0],finish=work.map(t=>t.deadline).sort()[0];
 const days=productionDays(start,finish,work[0].calendar);
 const span=days.length-(days.length>=4?1:0);
 if(!span)return tasks;
 return tasks.map(t=>{
  if(!byKey.has(t.key))return t;
  const from=Math.floor(early.get(t.key)!/length*span),through=Math.max(from,Math.ceil((length-tail.get(t.key)!)/length*span)-1);
  const eligible=days.slice(from,through+1).map(dateString).filter(d=>d>=t.start);
  if(!eligible.length)return t;
  // Quarter-hour cumulative increments keep small jobs readable without inventing hours.
  let previous=0;
  const pacing=eligible.map((date,i)=>{
   const x=(i+1)/eligible.length,cumulative=i===eligible.length-1?t.hours:Math.floor(t.hours*(x*x*(3-2*x))*4)/4;
   const hours=cumulative-previous;previous=cumulative;return {date,hours};
  }).filter(d=>d.hours>0);
  return {...t,pacing};
 });
}
