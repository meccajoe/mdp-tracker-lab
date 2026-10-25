import test from 'node:test';import assert from 'node:assert/strict';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {emptyPlan,parseProductionPlan,proposeProductionPlan,planMetrics} from '../src/lib/production-plan';
const roster=['Carpentry','Painting','CNC + cutting'].map(primary=>({primary,hours:40,active:true}));
function quote(){const q=createBlankQuoteV27();q.schedule={buildStart:'2026-10-05',buildFinish:'2026-10-30',installDate:'2026-11-02',status:'Closed won'};q.trades=roster.map((p,i)=>({id:String(i),name:p.primary,wage:20}));q.lines[0].name='Paint heavy';q.lines[1].name='Carpentry heavy';q.takeoffs=[[0,0,8],[0,1,40],[1,0,40],[1,1,8]].map(([item,trade,hours],i)=>({id:String(i),lineId:q.lines[item].id,description:q.trades[trade].name,materialId:null,tradeId:String(trade),quantity:0,sections:null,unitCostOverride:null,hours,resale:false}));return q;}
test('item dependencies create overlapping trade flow with conserved hours and unchanged quote',()=>{const q=quote(),before=JSON.stringify(q),p=proposeProductionPlan(q,roster);const a=p.tasks.filter(t=>t.item==='Paint heavy'),b=p.tasks.filter(t=>t.item==='Carpentry heavy');assert.equal(p.tasks.reduce((n,t)=>n+t.hours,0),96);assert.ok(a[1].start>a[0].finish);assert.ok(a[1].start<b[0].finish);assert.ok(a[1].start<b[1].start);for(const t of p.tasks)assert.ok(Math.abs(t.daily.reduce((n,d)=>n+d.hours,0)-t.hours)<1e-8);const days=new Map<string,number>();for(const t of p.tasks)for(const d of t.daily){const key=t.trade+d.date;days.set(key,(days.get(key)??0)+d.hours);}assert.ok([...days.values()].every(n=>n<=8));assert.equal(JSON.stringify(q),before);});
test('locks, waits, missing staffing, cyclic dependencies and deadline shortage remain explicit',()=>{const q=quote(),base=emptyPlan(),initial=proposeProductionPlan(q,roster),paint=initial.tasks.find(t=>t.item==='Paint heavy'&&t.stage==='finish')!;base.rules[paint.id]={locked:true,start:'2026-10-05',finish:'2026-10-06'};const locked=proposeProductionPlan(q,roster,base);assert.equal(locked.tasks.find(t=>t.id===paint.id)?.start,'2026-10-05');assert.ok(locked.warnings.some(w=>w.includes('violate')));base.rules[paint.id]={lagDays:3};assert.ok(proposeProductionPlan(q,roster,base).tasks.find(t=>t.id===paint.id)!.start>paint.start);q.schedule!.buildFinish='2026-10-06';assert.ok(proposeProductionPlan(q,[],base).lateHours>0);assert.ok(proposeProductionPlan(q,[],base).warnings.some(w=>w.includes('assuming')));base.rules[initial.tasks[0].id]={predecessors:[paint.id]};assert.ok(proposeProductionPlan(q,roster,base).warnings.some(w=>w.includes('cyclic')));});
test('weekends, remaining estimates, baseline measurement and parser preserve unknown actuals',()=>{const q=quote(),base=emptyPlan();base.calendar={saturday:true,sunday:true};const proposed=proposeProductionPlan(q,roster,base);assert.ok(proposed.tasks.flatMap(t=>t.daily).some(d=>new Date(d.date).getUTCDay()===6));base.tasks=proposed.tasks;base.baseline=structuredClone(proposed.tasks);base.actuals[base.tasks[0].id]={completed:base.tasks[0].finish,hours:null,reason:'On plan',notes:''};assert.deepEqual(parseProductionPlan(base),base);assert.equal(planMetrics(base)[0].daysLate,0);assert.equal(planMetrics(base)[0].hoursVariance,null);assert.throws(()=>parseProductionPlan({...base,rules:{x:{dailyHours:0}}}));assert.throws(()=>parseProductionPlan({...base,actuals:{x:{completed:'bad',hours:null,reason:'',notes:''}}}));const task=base.tasks[0];base.rules[task.id]={remainingHours:2};assert.equal(proposeProductionPlan(q,roster,base).tasks.find(t=>t.id===task.id)?.hours,2);assert.equal(base.baseline[0].hours,8);});

test('purchasing delay applies once after CAD, and zero remaining work has no phantom dates',()=>{
 const q=quote();q.lines[2].type='Design / Engineering / CAD';q.lines[2].name='Shared design';q.lines[2].overrides.hours=8;
 const base=emptyPlan(),first=proposeProductionPlan(q,roster,base);
 const carp=first.tasks.find(t=>t.item==='Paint heavy'&&t.stage==='carpentry')!;
 const paint=first.tasks.find(t=>t.item==='Paint heavy'&&t.stage==='finish')!;
 assert.equal((Date.parse(paint.start)-Date.parse(carp.finish))/86400000,1);
 base.rules[carp.id]={remainingHours:0};const next=proposeProductionPlan(q,roster,base);
 assert.equal(next.tasks.find(t=>t.id===carp.id)?.daily.length,0);
 assert.equal(next.tasks.find(t=>t.id===carp.id)?.finish,'');
 assert.throws(()=>parseProductionPlan({...base,rampDays:1.5}));
});
test('Finish and Painting tasks keep stable identities but share one staffing budget',()=>{
 const q=quote();q.trades.push({id:'finish',name:'Finish',wage:20});q.takeoffs=q.takeoffs.filter(r=>r.tradeId==='1');q.takeoffs[1].tradeId='finish';q.takeoffs[1].description='Finish';
 const result=proposeProductionPlan(q,[{primary:'Painting',hours:40,active:true}]);
 assert.ok(result.tasks.some(t=>t.trade==='Finish'));assert.ok(result.tasks.some(t=>t.trade==='Painting'));
 const totals:Record<string,number>={};for(const task of result.tasks)for(const d of task.daily)totals[d.date]=(totals[d.date]??0)+d.hours;
 assert.ok(Object.values(totals).every(h=>h<=8.000001));assert.ok(!result.warnings.some(w=>w.includes('no active primary')));
});

test('stage/pack/prep uses I&D staffing without changing quoted trade or prices',()=>{
 const q=createBlankQuoteV27();q.schedule={buildStart:'2026-10-19',buildFinish:'2026-10-23',installDate:'',status:'Closed won'};
 q.lines[0].type='Stage / Pack / Prep';q.lines[0].name='Shipping prep';q.lines[0].overrides.hours=8;
 const before=JSON.stringify(q),p=proposeProductionPlan(q,[{primary:'I&D',hours:20,active:true}],{...emptyPlan(),rampDays:0});
 assert.equal(p.tasks[0].stage,'packing');assert.equal(p.tasks[0].trade,'Crate & pack');assert.equal(p.tasks[0].daily.length,2);assert.ok(p.tasks[0].daily.every(d=>d.hours===4));assert.ok(!p.warnings.some(w=>w.includes('no active primary')));assert.equal(JSON.stringify(q),before);
});

test('new proposals use quoted CAD within turnover and never start production before turnover ends',()=>{
 const q=quote();q.schedule!.buildStart='2026-11-02';q.schedule!.buildFinish='2026-12-04';
 q.lines.find(l=>l.type==='Design / Engineering / CAD')!.overrides.hours=40;
 const p=proposeProductionPlan(q,roster),cad=p.tasks.filter(t=>t.stage==='cad'),shop=p.tasks.filter(t=>t.stage!=='cad');
 assert.equal(cad.reduce((n,t)=>n+t.daily.reduce((h,d)=>h+d.hours,0),0),40);
 assert.ok(cad.every(t=>t.finish<='2026-11-05'));
 assert.ok(shop.every(t=>t.start>='2026-11-09'));
 assert.ok(p.warnings.some(w=>w.includes('Readiness review')));
});
