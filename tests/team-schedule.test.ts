import test from 'node:test';import assert from 'node:assert/strict';
import {scheduleTeam,parseTeamOptions,sameTeamSources,type TeamTask,type TeamPerson,type TeamOptions} from '../src/lib/team-schedule';
const options:TeamOptions={start:'2026-10-19',finish:'2026-10-23',priority:[],availability:[]};
const person:TeamPerson={id:'p',name:'Pat',primary:'Carpentry',secondary:'Paint',hours:40,active:true};
const task=(key:string,extra:Partial<TeamTask>={}):TeamTask=>({key,workspaceId:key,project:key,item:'Wall',trade:'Carpentry',hours:24,start:options.start,finish:options.finish,deadline:options.finish,fixed:false,dailyLimit:8,predecessors:[],calendar:{saturday:false,sunday:false},completed:'',external:false,...extra});
test('global competition cannot double-book a person, conserves hours and honors deadline priority',()=>{
 const r=scheduleTeam([task('later'),task('urgent',{deadline:'2026-10-20',hours:16})],[person],options);
 assert.equal(r.assignedHours,40);assert.equal(r.unfilled.length,0);
 assert.equal(r.allocations[0].workspaceId,'urgent');
 for(const d of new Set(r.allocations.map(a=>a.date)))assert.ok(r.allocations.filter(a=>a.date===d).reduce((s,a)=>s+a.hours,0)<=8);
 const short=scheduleTeam([task('a',{hours:40}),task('b',{hours:40})],[person],options);
 assert.equal(short.assignedHours,40);assert.equal(short.unfilled.reduce((s,t)=>s+t.hours,0),40);
});
test('primary pass first and secondary uses remaining same-person availability; Finish/Paint alias',()=>{
 const r=scheduleTeam([task('paint',{trade:'Finish',hours:24}),task('carpentry',{hours:16})],[person],options);
 assert.equal(r.assignedHours,40);assert.equal(r.allocations[0].trade,'Carpentry');assert.ok(r.allocations.filter(a=>a.trade==='Finish').every(a=>a.secondary));
});
test('dependencies, completion, missing trades and fixed dates remain explicit',()=>{
 const r=scheduleTeam([task('cnc',{trade:'CNC + cutting',hours:8}),task('carp',{predecessors:['cnc']}),task('done',{completed:'2026-10-18'})],[person],options);
 assert.equal(r.assignedHours,0);assert.equal(r.unfilled.length,2);
 const ordered=scheduleTeam([task('one',{hours:8}),task('two',{hours:8,predecessors:['one']})],[person],options);
 assert.deepEqual(ordered.allocations.map(a=>a.date),['2026-10-19','2026-10-20']);
 const fixed=scheduleTeam([task('locked',{hours:16,finish:options.start,fixed:true})],[person],options);assert.equal(fixed.assignedHours,8);assert.equal(fixed.unfilled[0].hours,8);
});
test('time off, inactive employees, explicit weekend and weekly ceiling',()=>{
 const o={...options,finish:'2026-10-25',availability:[{personId:'p',date:'2026-10-19',hours:0},{personId:'p',date:'2026-10-24',hours:8}]};
 const r=scheduleTeam([task('a',{hours:56,deadline:o.finish,calendar:{saturday:true,sunday:true}})],[person],o);
 assert.equal(r.assignedHours,40);assert.ok(!r.allocations.some(a=>a.date==='2026-10-19'||a.date==='2026-10-25'));assert.ok(r.allocations.some(a=>a.date==='2026-10-24'));
 assert.equal(scheduleTeam([task('a')],[{...person,active:false}],options).assignedHours,0);
 assert.throws(()=>parseTeamOptions({...options,finish:'2029-01-01'}));
 assert.throws(()=>scheduleTeam([task('a')],[person],{...options,availability:[{personId:'p',date:options.start,hours:9}]}));
});
import {buildTeamSchedule} from '../src/lib/team-schedule-source';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
test('only committed quotes included, source snapshots untouched, unassigned labor retained',()=>{
 const q=createBlankQuoteV27();q.schedule={buildStart:options.start,buildFinish:options.finish,installDate:'',status:'Closed won'};q.lines[0].name='Wall';q.lines[0].overrides.hours=8;
 const before=JSON.stringify(q);const r=buildTeamSchedule([{workspaceId:'won',workspace:'Won',version:1,document:q},{workspaceId:'pipeline',workspace:'Maybe',version:1,document:{...q,schedule:{...q.schedule,status:'Likely'}}}],[{...person,rate:25,notes:''}],options);
 assert.deepEqual(r.projects.map(p=>p.id),['won']);assert.equal(r.totalHours,8);assert.equal(r.unfilled[0].trade,'Unassigned shop hours');assert.equal(JSON.stringify(q),before);assert.ok(!('rate' in r.people[0]));
});
test('zero remaining tasks do not block successors and lag follows actual allocation',()=>{
 const r=scheduleTeam([task('zero',{hours:0}),task('one',{hours:8,predecessors:['zero']}),task('two',{hours:8,predecessors:['one'],lagDays:1})],[person],options);
 assert.deepEqual(r.allocations.map(a=>a.date),['2026-10-19','2026-10-21']);
});

test('database JSON key order does not falsely mark saved sources stale',()=>{assert.equal(sameTeamSources({roster:1,quotes:[{id:'a',quote:2,plan:3}]},{quotes:[{plan:3,quote:2,id:'a'}],roster:1}),true);assert.equal(sameTeamSources({roster:1,quotes:[]},{roster:2,quotes:[]}),false);});

test('packing and stage/prep share the I&D person budget across projects',()=>{
 const crew={...person,primary:'I&D',secondary:'Crate & pack'};
 const r=scheduleTeam([task('pack',{trade:'Crate & pack',hours:24}),task('prep',{trade:'Stage / Pack / Prep',hours:24})],[crew],options);
 assert.equal(r.assignedHours,40);assert.equal(r.unfilled.reduce((n,t)=>n+t.hours,0),8);
 assert.ok(r.allocations.every(a=>a.personId===crew.id&&!a.secondary));
 for(const date of new Set(r.allocations.map(a=>a.date)))assert.ok(r.allocations.filter(a=>a.date===date).reduce((n,a)=>n+a.hours,0)<=8);
});

test('Vinyl Install and Graphic Install use the same people without double-booking',()=>{
 for(const primary of ['Graphic Install','Vinyl Install']){
  const crew={...person,primary,secondary:primary==='Graphic Install'?'Vinyl Install':'Graphic Install'};
  const r=scheduleTeam([task('vinyl',{trade:'Vinyl Install',hours:24}),task('graphic',{trade:'Graphic Install',hours:24})],[crew],options);
  assert.equal(r.assignedHours,40);
  assert.equal(r.unfilled.reduce((sum,t)=>sum+t.hours,0),8);
  assert.ok(r.allocations.every(a=>a.personId===crew.id&&!a.secondary));
  for(const date of new Set(r.allocations.map(a=>a.date)))assert.ok(r.allocations.filter(a=>a.date===date).reduce((sum,a)=>sum+a.hours,0)<=8);
 }
});

test('unsaved range calculations change assignments and conserve required work without mutating sources',()=>{
 const tasks=[task('a',{hours:40})],before=JSON.stringify(tasks);
 const full=scheduleTeam(tasks,[person],options);
 const short=scheduleTeam(tasks,[person],{...options,finish:'2026-10-20'});
 assert.equal(full.assignedHours,40);assert.equal(short.assignedHours,16);
 assert.equal(short.totalHours,40);assert.equal(short.unfilled.reduce((sum,t)=>sum+t.hours,0),24);
 assert.equal(JSON.stringify(tasks),before);
});

test('explicit Not Active and Complete stay out of team scheduling while Active is eligible',()=>{
 const q=createBlankQuoteV27();q.schedule={buildStart:options.start,buildFinish:options.finish,installDate:'',status:'Closed won',projectStatus:'Not Active'};
 const r=buildTeamSchedule(['Not Active','Complete','Active'].map((status,i)=>({workspaceId:String(i),workspace:status,version:1,document:{...q,schedule:{...q.schedule!,projectStatus:status as 'Not Active'|'Complete'|'Active'}}})),[],options);
 assert.deepEqual(r.projects.map(p=>p.name),['Active']);
});

test('live scheduling includes projects needing dates without blocking other Active projects',()=>{
 const q=createBlankQuoteV27();q.schedule={buildStart:options.start,buildFinish:options.finish,installDate:'',status:'Closed won',projectStatus:'Active'};q.lines[0].overrides.hours=8;
 const quotes=[{workspaceId:'ok',workspace:'Ready',version:1,document:q},{workspaceId:'missing',workspace:'Missing dates',version:1,document:{...q,schedule:{...q.schedule,buildStart:''}}}];
 const before=JSON.stringify(quotes);
 assert.throws(()=>buildTeamSchedule(quotes,[],options));
 const live=buildTeamSchedule(quotes,[],options,true);
 assert.equal(live.projects.length,2);assert.equal(live.totalHours,16);
 assert.equal(live.unfilled.reduce((sum,row)=>sum+row.hours,0),16);
 assert.ok(live.unfilled.some(row=>row.taskKey==='missing|attention'&&row.reason.includes('build dates')));
 assert.equal(JSON.stringify(quotes),before);
});

import {scheduleTeamWithOvertime} from '../src/lib/team-schedule';
test('automatic overtime uses regular time first and weekday extras before weekends',()=>{
 const full={...options,finish:'2026-10-25'};
 const run=(hours:number)=>scheduleTeamWithOvertime([task('a',{hours,deadline:full.finish,finish:full.finish})],[person],full);
 assert.equal(run(40).allocations.filter(a=>a.workMode!=='Regular').length,0);
 const weekday=run(60);assert.equal(weekday.assignedHours,60);assert.equal(weekday.allocations.filter(a=>a.workMode==='Weekday overtime').reduce((n,a)=>n+a.hours,0),20);assert.ok(!weekday.allocations.some(a=>a.workMode==='Weekend'));
 const saturday=run(68);assert.equal(saturday.assignedHours,68);assert.ok(saturday.allocations.some(a=>a.date==='2026-10-24'));assert.ok(!saturday.allocations.some(a=>a.date==='2026-10-25'));
 const sunday=run(80);assert.equal(sunday.assignedHours,76);assert.equal(sunday.unfilled[0].hours,4);assert.ok(sunday.allocations.some(a=>a.date==='2026-10-25'));
});
test('overtime is one shared person budget across projects and pressure identifies competing work',()=>{
 const full={...options,finish:'2026-10-25'},tasks=[task('a',{hours:40,deadline:full.finish}),task('b',{hours:40,deadline:full.finish})];
 const before=JSON.stringify(tasks),r=scheduleTeamWithOvertime(tasks,[person],full);
 assert.equal(r.assignedHours,76);assert.equal(r.assignedHours+r.unfilled.reduce((n,a)=>n+a.hours,0),80);
 for(const date of new Set(r.allocations.map(a=>a.date))){const weekend=new Date(date+'T00:00:00Z').getUTCDay()%6===0;assert.ok(r.allocations.filter(a=>a.date===date).reduce((n,a)=>n+a.hours,0)<=(weekend?8:12));}
 assert.ok(r.pressure?.some(p=>p.projects.includes('a')&&p.projects.includes('b')));assert.equal(JSON.stringify(tasks),before);
});
test('automatic extra shifts preserve absences, holidays, fixed windows and prerequisites',()=>{
 const full={...options,finish:'2026-10-25',availability:[{personId:'p',date:'2026-10-19',hours:0},{personId:'p',date:'2026-10-24',hours:0}]};
 const r=scheduleTeamWithOvertime([task('a',{hours:80,deadline:full.finish,calendar:{saturday:false,sunday:false,holidays:['2026-10-25']}})],[person],full);
 assert.equal(r.assignedHours,48);assert.ok(r.allocations.every(a=>a.date>'2026-10-19'&&a.date<'2026-10-24'));
 const fixed=scheduleTeamWithOvertime([task('a',{hours:20,fixed:true,finish:options.start})],[person],options);assert.equal(fixed.assignedHours,12);
 const missing=scheduleTeamWithOvertime([task('a',{trade:'CNC',hours:8}),task('b',{predecessors:['a']})],[person],full);assert.equal(missing.assignedHours,0);
 const dependency=scheduleTeamWithOvertime([task('a',{hours:10}),task('b',{hours:40,predecessors:['a']})],[person],options);const last=dependency.allocations.filter(a=>a.taskKey==='a').at(-1)!.date;assert.ok(dependency.allocations.filter(a=>a.taskKey==='b').every(a=>a.date>last));
});

test('recovery does not move already feasible independent work into overtime or weekends',()=>{
 const full={...options,finish:'2026-10-25'};
 const r=scheduleTeamWithOvertime([task('short',{hours:68,deadline:full.finish}),task('fits',{trade:'Painting',hours:32,deadline:full.finish})],[{...person,secondary:''},{...person,id:'paint',name:'Paint',primary:'Painting',secondary:''}],full);
 assert.equal(r.allocations.filter(a=>a.taskKey==='fits').reduce((n,a)=>n+a.hours,0),32);
 assert.ok(r.allocations.filter(a=>a.taskKey==='fits').every(a=>a.workMode==='Regular'));
 assert.ok(r.allocations.some(a=>a.taskKey==='short'&&a.workMode==='Weekend'));
});

test('recovery adds qualified crew before overtime and reports applied staffing',()=>{
 const oneDay={...options,finish:options.start};
 const tasks=[task('urgent',{hours:16,deadline:oneDay.finish,finish:oneDay.finish})];
 const before=JSON.stringify(tasks);
 const r=scheduleTeamWithOvertime(tasks,[person,{...person,id:'second',name:'Second'}],oneDay);
 assert.equal(r.assignedHours,16);assert.equal(r.unfilled.length,0);
 assert.ok(r.allocations.every(a=>a.workMode==='Regular'));
 assert.equal(r.crewAdjustments?.[0].people,2);
 assert.equal(JSON.stringify(tasks),before);
 const capped=scheduleTeamWithOvertime([{...tasks[0],expandCrew:false}],[person,{...person,id:'second',name:'Second'}],oneDay);
 assert.equal(capped.assignedHours,12);assert.match(capped.unfilled[0].recommendation!,/additional 8-hour shifts/);
});
test('crew expansion shares people across competing projects and never invents staff',()=>{
 const oneDay={...options,finish:options.start};
 const r=scheduleTeamWithOvertime([task('a',{hours:24,deadline:oneDay.finish}),task('b',{hours:24,deadline:oneDay.finish})],[person,{...person,id:'second',name:'Second'}],oneDay);
 assert.equal(r.assignedHours,24);assert.equal(r.unfilled.reduce((s,r)=>s+r.hours,0),24);
 for(const p of r.people)assert.ok(r.allocations.filter(a=>a.personId===p.id).reduce((s,a)=>s+a.hours,0)<=12);
 assert.ok(r.unfilled.every(row=>row.recommendation?.includes('qualified')));
});
test('CAD ramp-up applies to CAD edge only, not again after CNC',()=>{
 const tasks=[task('cad',{external:true,hours:6,finish:'2026-10-19'}),task('cnc',{hours:4,start:'2026-10-21',predecessors:['cad'],predecessorLagDays:{cad:1}}),task('carp',{hours:8,start:'2026-10-22',predecessors:['cad','cnc'],predecessorLagDays:{cad:1,cnc:0}})];
 const r=scheduleTeamWithOvertime(tasks,[person],options);
 assert.equal(r.allocations.find(a=>a.taskKey==='cnc')?.date,'2026-10-21');
 assert.equal(r.allocations.find(a=>a.taskKey==='carp')?.date,'2026-10-22');
});

test('recovery moves flexible downstream work earlier when added crew finishes prerequisites',()=>{
 const tasks=[task('first',{hours:16,finish:'2026-10-23',deadline:'2026-10-20'}),task('next',{hours:8,start:'2026-10-26',finish:'2026-10-26',deadline:'2026-10-20',predecessors:['first'],recoveryStart:options.start})];
 const r=scheduleTeamWithOvertime(tasks,[person,{...person,id:'second',name:'Second'}],options);
 assert.equal(r.assignedHours,24);assert.equal(r.unfilled.length,0);
 assert.equal(r.allocations.find(a=>a.taskKey==='next')?.date,'2026-10-20');
 const locked=scheduleTeamWithOvertime([{...tasks[1],fixed:true,predecessors:[]}],[person],options);
 assert.equal(locked.assignedHours,0);
});

test('live preparation shows unstaffed CAD and turnover without adding them to shop assignments',()=>{
 const q=createBlankQuoteV27();q.schedule={buildStart:'2026-11-02',buildFinish:'2026-11-27',installDate:'',status:'Closed won',projectStatus:'Active'};
 const cad=q.lines.find(l=>l.type==='Design / Engineering / CAD')!;cad.overrides.hours=72;q.takeoffs=[];
 const before=JSON.stringify(q),r=buildTeamSchedule([{activationDate:'2026-11-02',workspaceId:'test',workspace:'Test',version:1,document:q}],[],{...options,start:'2026-11-02',finish:'2026-11-27'},true);
 assert.equal(r.preparation[0].hours,72);assert.equal(r.preparation[0].finish,'2026-11-04');assert.equal(r.preparation[1].start,'2026-11-02');assert.equal(r.preparation[1].hours,null);
 assert.equal(r.assignedHours,0);assert.equal(r.totalHours,0);assert.equal(JSON.stringify(q),before);
 q.lines[0].overrides.hours=8;const shop=buildTeamSchedule([{activationDate:'2026-11-02',workspaceId:'test',workspace:'Test',version:1,document:q}],[{...person,primary:'Unassigned shop hours',rate:20,notes:''}],{...options,start:'2026-11-02',finish:'2026-11-27'},true);assert.equal(shop.assignedHours,8);assert.ok(shop.allocations.every(a=>a.date>='2026-11-06'));
});

import {emptyPlan,proposeProductionPlan} from '../src/lib/production-plan';
import {capacityProject} from '../src/lib/capacity';
test('activation is Project Start and Day 1; approved production cannot bypass planned turnover',()=>{
 const q=createBlankQuoteV27();q.schedule={buildStart:'2026-11-16',buildFinish:'2026-11-27',installDate:'',status:'Closed won',projectStatus:'Active'};
 q.lines.find(l=>l.type==='Design / Engineering / CAD')!.overrides.hours=72;q.lines[0].overrides.hours=8;q.takeoffs=[];
 const source={activationDate:'2026-11-02',workspaceId:'test',workspace:'Test',version:1,document:q};
 assert.equal(capacityProject(source).schedule.buildStart,'2026-11-02');assert.equal(q.schedule.buildStart,'2026-11-16');
 const plan={...emptyPlan(),quoteVersion:1,status:'approved' as const,tasks:proposeProductionPlan(q,[]).tasks.map(t=>({...t,start:'2026-11-02',finish:'2026-11-02',daily:[{date:'2026-11-02',hours:t.hours}]}))};
 const before=JSON.stringify(plan),r=buildTeamSchedule([{...source,productionPlan:plan}],[{...person,primary:'Unassigned shop hours',rate:20,notes:''}],{...options,start:'2026-11-02',finish:'2026-11-27'},true);
 assert.equal(r.assignedHours,0);assert.equal(r.unfilled.reduce((s,t)=>s+t.hours,0),8);
 assert.ok(r.warnings.some(w=>w.includes('saved dates overlap project turnover')));
 assert.ok(r.warnings.some(w=>w.includes('readiness review')));assert.equal(JSON.stringify(plan),before);
 const live=buildTeamSchedule([source],[{...person,primary:'Unassigned shop hours',rate:20,notes:''}],{...options,start:'2026-11-02',finish:'2026-11-27'},true);
 assert.equal(live.assignedHours,8);assert.equal(live.allocations[0].date,'2026-11-06');
});
