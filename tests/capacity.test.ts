import test from 'node:test';
import {utils} from 'xlsx';
import {importCapacityRoster} from '../src/lib/capacity-roster-import';
import {capacityViewRange,dashboardLoad} from '../src/lib/capacity-dashboard';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allocateHours,capacityLoad,capacityProject,emptyCapacity,emptyOverride,parseCapacity,parsePlanning,quoteDemand,rosterCapacity} from '../src/lib/capacity';
import {EMPTY_SCHEDULE,parseSchedule} from '../src/lib/quote-schedule';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
const fresh=()=>JSON.parse(readFileSync(new URL('../src/data/quote-v27-fonroche.json',import.meta.url),'utf8'));
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const settings=()=>({...emptyCapacity().settings,weekStart:'2026-10-05'});
function project(status='Possible'){const document=fresh();document.schedule={...EMPTY_SCHEDULE,buildStart:'2026-10-05',buildFinish:'2026-10-16',installDate:'2026-10-19',status};return capacityProject({workspaceId:'one',workspace:'Test only',document});}

test('capacity exports preserve historical quote hours, trades, field, design and price',()=>{
 const d=quoteDemand(fresh());assert.equal(d.shop,60);assert.equal(d.field,40);assert.equal(d.design,12);close(d.price,28953.192);assert.deepEqual(Object.values(d.trades).sort((a,b)=>a-b),[4,12,44]);assert.equal(d.untyped,0);
 const q=fresh();q.takeoffs.forEach((row:any)=>row.tradeId=null);const fallback=quoteDemand(q);assert.ok(sum(Object.values(fallback.trades))>0);assert.equal(fallback.shop,60);
});
test('partial weeks allocate exact days without manufacturing demand; UTC survives DST',()=>{
 assert.deepEqual(allocateHours(30,'2026-10-09','2026-10-13','2026-10-05',2),[10,20]);
 assert.deepEqual(allocateHours(50,'2026-10-09','2026-10-13','2026-10-05',2,'calendar'),[30,20]);
 close(sum(allocateHours(100,'2026-10-30','2026-11-03','2026-10-26')),100);
 close(sum(allocateHours(100,'2026-10-02','2026-10-09','2026-10-05')),100*5/6);
 assert.equal(sum(allocateHours(100,'2026-10-10','2026-10-11','2026-10-05')),0);
 assert.equal(sum(allocateHours(100,'2026-10-20','2026-10-01','2026-10-05')),0);
});
test('pipeline, committed and full-job scenarios count each quote once',()=>{
 const possible=capacityLoad([project()],settings(),'shop',['one']);close(sum(possible.pipeline),30);close(sum(possible.committed),0);close(sum(possible.scenario),60);
 for(const status of ['Closed won','In production']){const load=capacityLoad([project(status)],settings(),'shop',['one']);close(sum(load.expected),60);close(sum(load.committed),60);close(sum(load.pipeline),0);close(sum(load.scenario),60);}
 for(const status of ['Lost','Completed',''])assert.equal(sum(capacityLoad([project(status)],settings(),'shop',['one']).expected),0);
 const unscheduled=project();unscheduled.schedule={...unscheduled.schedule,buildStart:''};assert.deepEqual(capacityLoad([unscheduled],settings(),'shop').unscheduled,['Test only']);
});
test('install demand uses install dates; build mode remains explicitly available',()=>{
 const field=capacityLoad([project('Closed won')],settings(),'field');assert.equal(field.expected[0],0);assert.equal(field.expected[1],0);close(sum(field.expected),40);assert.ok(field.expected[2]>0);
 const build=capacityLoad([project('Closed won')],{...settings(),fieldAllocation:'build'},'field');close(sum(build.expected.slice(0,2)),40);
});
test('roster secondary skills do not double count shop or support capacity',()=>{
 const base={id:'a',name:'Test person',primary:'Carpentry',secondary:'Painting',hours:40,rate:null,active:true,notes:''};
 const result=rosterCapacity([base,{...base,id:'b',primary:'I&D',secondary:''},{...base,id:'c',primary:'Driver/Pickups',secondary:''},{...base,id:'d',active:false}]);
 assert.equal(result.shop,40);assert.equal(result.field,40);assert.equal(result.flex.Painting,40);assert.equal(result.primary.Carpentry,40);
});
test('schedule/settings validation preserves old snapshots and rejects invalid dates/configuration',()=>{
 assert.ok(parseQuoteV27(fresh()));assert.throws(()=>parseSchedule({...EMPTY_SCHEDULE,buildStart:'2026-02-29'}));assert.throws(()=>parseSchedule({...EMPTY_SCHEDULE,buildStart:'2026-10-10',buildFinish:'2026-10-09'}));
 assert.equal(parseSchedule({...EMPTY_SCHEDULE,installDate:'2028-02-29'}).installDate,'2028-02-29');
 assert.ok(parseCapacity({settings:settings()}));assert.throws(()=>parseCapacity({settings:{...settings(),weekStart:'2026-10-06'}}));assert.throws(()=>parseCapacity({settings:{...settings(),allocation:'magic'}}));
 const q=fresh();q.schedule={...EMPTY_SCHEDULE,buildStart:'2026-10-05',buildFinish:'2026-10-16',status:'Likely'};q.planning=emptyOverride();assert.deepEqual(parseQuoteV27(q).schedule,q.schedule);
});
test('remaining-hour and status overrides are separate from quote baseline and validate strictly',()=>{
 const source=project(),original=JSON.stringify(source.document),override={...emptyOverride(),status:'In production' as const,remainingShop:20,remainingField:0};const planned=capacityProject(source,override);assert.equal(planned.shop,20);assert.equal(planned.field,0);assert.equal(planned.probability,1);assert.equal(planned.demand.shop,60);assert.equal(JSON.stringify(source.document),original);assert.ok(planned.flags.some(flag=>flag.includes('exceed')));assert.deepEqual(parsePlanning(override),override);assert.throws(()=>parsePlanning({...override,remainingShop:-1}));assert.throws(()=>parsePlanning({...override,status:'whatever'}));
});

test('dashboard project filters preserve roster capacity and weight trade and total demand consistently',()=>{
 const a=project('Possible'),b={...project('Closed won'),workspaceId:'two',workspace:'Second'};
 const config={...settings(),roster:[{id:'a',name:'Shop test',primary:'Carpentry',secondary:'Painting',hours:40,rate:null,active:true,notes:''},{id:'cad',name:'CAD test',primary:'Design / Engineering / CAD',secondary:'',hours:40,rate:null,active:true,notes:''}]};
 const original=structuredClone([a,b]);
 const all=dashboardLoad([a,b],config,null,'expected');close(sum(all.load.expected),90);assert.equal(all.capacity.shop,40);
 const one=dashboardLoad([a,b],config,['one'],'expected');close(sum(one.load.expected),30);assert.equal(one.capacity.shop,40);assert.equal(one.projects.length,1);
 close(sum(dashboardLoad([a,b],config,[],'full').load.expected),0);
 const full=dashboardLoad([a,b],config,['one'],'full');close(sum(full.load.expected),60);close(sum(Object.values(full.load.trades).map(sum)),60);
 close(sum(dashboardLoad([a,b],config,null,'committed').load.expected),60);
 for(const status of ['Lost','Completed',''])close(sum(dashboardLoad([project(status)],config,null,'full').load.expected),0);
 assert.deepEqual([a,b],original);
});
test('dashboard keeps unplottable demand visible and clips only at the selected date horizon',()=>{
 const p=project('Closed won');p.schedule={...p.schedule,buildStart:''};
 assert.deepEqual(dashboardLoad([p],settings(),null,'full').load.unscheduled,['Test only']);
 const after=dashboardLoad([project('Closed won')],{...settings(),weekStart:'2026-10-19'},null,'full');close(sum(after.load.expected),0);
});

function rosterBook(){
 const sheet=utils.aoa_to_sheet([...Array.from({length:11},()=>[]),['Name','Primary trade','Secondary trade (flex)','Hours / week','Hourly rate $','Active? (Yes/No)','Notes'],['Sample carpenter','Carpentry','Assembly',40,25,'Yes','Sample'],['Temp worker','Carpentry','',20,20,'No',''],['Temp worker','Painting','Finish',32,null,'Yes','']]);
 return {SheetNames:['Roster & Settings'],Sheets:{'Roster & Settings':sheet}};
}
test('roster import preserves staff, duplicate names, inactive rows, blank wages and source workbook',()=>{
 const book=rosterBook(),before=structuredClone(book);let id=0;
 const rows=importCapacityRoster(book,()=>String(++id));
 assert.equal(rows.length,3);assert.equal(rows[1].active,false);assert.equal(rows[2].rate,null);assert.notEqual(rows[1].id,rows[2].id);assert.equal(rows[0].notes,'Sample');
 assert.equal(rosterCapacity(rows).shop,72);assert.equal(rosterCapacity(rows).flex.Assembly,40);assert.deepEqual(book,before);
});
test('roster import refuses wrong layouts, partial staff, invalid hours, statuses and uncached formulas',()=>{
 for(const [cell,value] of [['A12','Wrong header'],['A13',''],['D13',-1],['D13',169],['F13','Maybe']] as const){const b=rosterBook();b.Sheets['Roster & Settings'][cell]={v:value,t:typeof value==='number'?'n':'s'};assert.throws(()=>importCapacityRoster(b,()=>crypto.randomUUID()));}
 const b=rosterBook();b.Sheets['Roster & Settings'].D13={t:'n',f:'1+1'};assert.throws(()=>importCapacityRoster(b,()=>crypto.randomUUID()));
 b.Sheets['Roster & Settings']['!fullref']='A1:K400';assert.throws(()=>importCapacityRoster(b,()=>crypto.randomUUID()));
});

test('custom view dates cover whole weeks and support demand beyond the old 26-week limit',()=>{
 assert.deepEqual(capacityViewRange('2026-10-07','2026-10-20'),{weekStart:'2026-10-05',count:3});
 assert.equal(capacityViewRange('2026-10-07',''),null);
 assert.equal(capacityViewRange('2026-10-07','2026-10-06'),null);
 assert.equal(capacityViewRange('2026-10-07','2030-10-06'),null);
 const p=project('Closed won');p.document!.schedule={...p.document!.schedule!,buildStart:'2027-06-07',buildFinish:'2027-06-18'};
 const future=capacityProject({workspaceId:'future',workspace:'Future test',document:p.document!});
 const result=dashboardLoad([future],settings(),null,'full',52);
 assert.equal(result.load.expected.length,52);close(sum(result.load.expected),60);
 close(sum(result.load.expected.slice(0,26)),0);
});

test('new quote header dates round-trip without adding fields to historical schedules',()=>{
 const old={installDate:'2026-10-30',buildStart:'2026-10-05',buildFinish:'2026-10-20',status:'Likely'};
 assert.deepEqual(parseSchedule(old),old);
 const dates={...old,dueDate:'2026-10-25',shipDate:'2026-10-26'};
 assert.deepEqual(parseSchedule(dates),dates);
 assert.throws(()=>parseSchedule({...dates,shipDate:'2026-02-30'}));
 assert.deepEqual(parseSchedule({...dates,dueDate:'',shipDate:''}),{...dates,dueDate:'',shipDate:''});
});
