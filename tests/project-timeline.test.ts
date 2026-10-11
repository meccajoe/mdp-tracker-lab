import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTimeline,stageLabor} from '../src/lib/project-timeline';
import {productionDays,parseProductionCalendar} from '../src/lib/production-calendar';
import {EMPTY_SCHEDULE} from '../src/lib/quote-schedule';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {allocateHours,capacityLoad,capacityProject,emptyCapacity} from '../src/lib/capacity';
const schedule={...EMPTY_SCHEDULE,buildStart:'2026-10-05',buildFinish:'2026-10-30',installDate:'2026-11-02'};
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
test('six stages preserve exact shares, skip weekends and end at build finish',()=>{
  const plan=projectTimeline(schedule);assert.equal(plan.workdays,20);
  assert.deepEqual(plan.stages.map(s=>s.workdays),[3,1,2,8,4,2]);
  assert.deepEqual(plan.stages.map(s=>[s.start,s.finish]),[['2026-10-05','2026-10-07'],['2026-10-08','2026-10-08'],['2026-10-09','2026-10-12'],['2026-10-13','2026-10-22'],['2026-10-23','2026-10-28'],['2026-10-29','2026-10-30']]);
  assert.equal(plan.stages.reduce((n,s)=>n+s.percent,0),100);assert.equal(plan.warnings.length,0);
});
test('independent weekend toggles change dates, preserve duration and survive snapshot parsing',()=>{
  const q=createBlankQuoteV27();q.schedule=schedule;
  for(const [saturday,sunday,count] of [[false,false,20],[true,false,23],[false,true,23],[true,true,26]] as const){
    q.productionCalendar={saturday,sunday};const parsed=parseQuoteV27(q);
    assert.deepEqual(parsed.productionCalendar,{saturday,sunday});
    const result=projectTimeline(schedule,parsed.productionCalendar);assert.equal(result.workdays,count);assert.equal(sum(result.stages.map(s=>s.workdays)),count);
  }
  delete q.productionCalendar;assert.equal('productionCalendar' in parseQuoteV27(q),false);
  assert.throws(()=>parseProductionCalendar({saturday:'yes',sunday:false}));assert.throws(()=>parseProductionCalendar({saturday:true}));
});
test('short, missing, weekend-only and conflicting schedules have explicit flags',()=>{
  const one=projectTimeline({...schedule,buildFinish:schedule.buildStart});assert.equal(one.stages.length,6);assert.ok(one.stages.every(s=>s.start===schedule.buildStart&&s.finish===schedule.buildStart));assert.equal(sum(one.stages.map(s=>s.workdays)),1);assert.ok(one.warnings.some(w=>w.includes('Short schedule')));
  const missing=projectTimeline(EMPTY_SCHEDULE);assert.equal(missing.workdays,0);assert.ok(missing.warnings.some(w=>w.includes('Set Build')));
  const weekend={...schedule,buildStart:'2026-10-10',buildFinish:'2026-10-11'};assert.equal(projectTimeline(weekend).workdays,0);assert.equal(projectTimeline(weekend,{saturday:false,sunday:true}).workdays,1);
  assert.ok(projectTimeline({...schedule,installDate:'2026-10-01'}).warnings.some(w=>w.includes('before Build finish')));
  assert.equal(productionDays('2026-10-30','2026-11-03').length,3);assert.ok(projectTimeline({...schedule,buildFinish:'2026-10-01'}).warnings.some(w=>w.includes('on or after')));
});
test('overall production load respects per-project weekends without changing quoted demand or field install',()=>{
  const q=createBlankQuoteV27();q.lines[0].takeoffDriven=false;q.lines[0].inputs.hours=40;
  q.schedule={...schedule,buildStart:'2026-10-09',buildFinish:'2026-10-13',status:'Closed won'};
  const settings={...emptyCapacity().settings,weekStart:'2026-10-05'};
  const make=()=>capacityProject({workspaceId:'a',workspace:'Test',document:q});
  const normal=capacityLoad([make()],settings,'shop');assert.ok(Math.abs(normal.expected[0]-40/3)<1e-9);
  const before=make().demand;
  q.productionCalendar={saturday:true,sunday:false};const sat=capacityLoad([make()],settings,'shop');assert.equal(sat.expected[0],20);assert.equal(sum(sat.expected),40);
  q.productionCalendar={saturday:false,sunday:true};assert.equal(capacityLoad([make()],settings,'shop').expected[0],20);
  q.productionCalendar={saturday:true,sunday:true};const all=capacityLoad([make()],settings,'shop');assert.equal(all.expected[0],24);assert.equal(sum(all.expected),40);assert.deepEqual(make().demand,before);
  assert.deepEqual(allocateHours(40,q.schedule.buildStart,q.schedule.buildFinish,settings.weekStart,2,{saturday:true,sunday:false}),[20,20]);
});
test('stage labor maps exact trade names once and keeps unknown/untyped hours separate',()=>{
  const q=createBlankQuoteV27();const p=capacityProject({workspaceId:'a',workspace:'Test',document:q});
  p.trades={'CNC + cutting':12,Carpentry:40,Assembly:8,Painting:20,'Crate & pack':10,Electrical:6};p.untyped=4;p.demand.design=15;
  const result=stageLabor(p);assert.deepEqual(result.hours,{cad:15,cnc:12,carpentry:48,finish:20,packing:10});assert.deepEqual(result.other,{Electrical:6,'Untyped / other':4});assert.equal('purchasing' in result.hours,false);
});
