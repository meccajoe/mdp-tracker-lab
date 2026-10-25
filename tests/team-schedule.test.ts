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
 assert.equal(live.assignedHours,8);assert.ok(live.allocations[0].date>='2026-11-06');assert.equal(live.allocations.at(-1)!.date,'2026-11-26');
});

import {paceProjectTasks} from '../src/lib/team-pacing';
test('light projects use the full production window with one working day of buffer',()=>{
 const o={...options,start:'2026-11-02',finish:'2026-11-27'};
 const input=[task('wall',{workspaceId:'project',hours:24,start:o.start,finish:o.finish,deadline:o.finish})],before=JSON.stringify(input);
 const paced=paceProjectTasks(input),r=scheduleTeamWithOvertime(paced,[person],o);
 assert.equal(r.assignedHours,24);assert.equal(r.unfilled.length,0);
 assert.equal(r.allocations.at(-1)!.date,'2026-11-26');assert.ok(r.allocations.length>10);
 assert.ok(r.allocations.every(a=>a.workMode==='Regular'));assert.equal(JSON.stringify(input),before);
});
test('pacing follows item dependencies, lets separate items overlap and keeps shared staff ceilings',()=>{
 const o={...options,start:'2026-11-02',finish:'2026-11-27'};
 const base={workspaceId:'project',start:o.start,finish:o.finish,deadline:o.finish};
 const tasks=paceProjectTasks([task('cut',{...base,hours:8}),task('assemble',{...base,hours:24,predecessors:['cut']}),task('paint',{...base,trade:'Paint',hours:16,predecessors:['assemble']}),task('other',{...base,hours:16})]);
 const r=scheduleTeamWithOvertime(tasks,[person,{...person,id:'paint',name:'Painter',primary:'Paint',secondary:''}],o);
 assert.equal(r.assignedHours,64);assert.equal(r.unfilled.length,0);
 const dates=(key:string)=>r.allocations.filter(a=>a.taskKey===key).map(a=>a.date).sort();
 assert.ok(dates('cut').at(-1)!<dates('assemble')[0]);assert.ok(dates('assemble').at(-1)!<dates('paint')[0]);assert.equal(dates('paint').at(-1),'2026-11-26');
 for(const date of new Set(r.allocations.map(a=>a.date)))for(const id of ['p','paint'])assert.ok(r.allocations.filter(a=>a.date===date&&a.personId===id).reduce((s,a)=>s+a.hours,0)<=8+1e-6);
});
test('pacing yields to real deadline pressure, retains explicit fixed windows, and does not invent labor',()=>{
 const input=[task('heavy',{hours:48})],paced=paceProjectTasks(input);
 const r=scheduleTeamWithOvertime(paced,[person],options);
 assert.equal(r.assignedHours,48);assert.equal(r.unfilled.length,0);assert.ok(r.allocations.some(a=>a.workMode==='Weekday overtime'));
 const relaxed=scheduleTeamWithOvertime([task('soft',{hours:24,pacing:[{date:options.finish,hours:24}]})],[person],options);
 assert.equal(relaxed.assignedHours,24);assert.ok(relaxed.warnings.some(w=>w.includes('pacing was relaxed')));
 assert.ok(relaxed.allocations.every(a=>a.workMode==='Regular'));
 const locked=[task('locked',{fixed:true,hours:8,finish:options.start})];assert.deepEqual(paceProjectTasks(locked),locked);
});
test('a short date view does not trigger overtime or pull future work forward',()=>{
 const finish='2026-11-27',paced=paceProjectTasks([task('later',{start:'2026-11-02',finish,deadline:finish,hours:40})]);
 const r=scheduleTeamWithOvertime(paced,[person],{...options,start:'2026-11-02',finish:'2026-11-06'});
 assert.ok(r.assignedHours<40);assert.ok(r.allocations.every(a=>a.workMode==='Regular'));
 assert.match(r.unfilled[0].recommendation!,/future work is not a staffing shortage/);assert.equal(r.unfilled[0].futureHours,r.unfilled[0].hours);
});

test('untyped work calls for trade attribution rather than hiring an unassigned employee',()=>{
 const r=scheduleTeamWithOvertime([task('walls',{trade:'Unassigned shop hours',hours:7.5,item:'beMatrix walls'})],[person],options);
 assert.equal(r.assignedHours,0);assert.match(r.unfilled[0].recommendation!,/Assign the actual trade/);assert.doesNotMatch(r.unfilled[0].recommendation!,/qualified Unassigned/);
});

test('saved scheduling-team rule assigns untyped beMatrix work to I&D without quote changes',()=>{
 const q=createBlankQuoteV27();q.schedule={buildStart:'2026-10-25',buildFinish:'2026-10-29',installDate:'',status:'Closed won',projectStatus:'Active'};q.takeoffs=[];q.lines[0].name='beMatrix walls';q.lines[0].overrides.hours=7.5;
 const initial=proposeProductionPlan(q,[]),id=initial.tasks.find(t=>t.item==='beMatrix walls')!.id;
 const plan={...emptyPlan(),quoteVersion:1,rules:{[id]:{trade:'I&D'}}};const before=JSON.stringify(q);
 const r=buildTeamSchedule([{workspaceId:'whatnot',workspace:'Whatnot',version:1,document:q,productionPlan:plan}],[{...person,primary:'I&D',rate:20,notes:''}],{...options,start:'2026-10-25',finish:'2026-10-29'},true);
 assert.equal(r.assignedHours,7.5);assert.equal(r.unfilled.length,0);assert.ok(r.allocations.every(a=>a.trade==='I&D'));assert.equal(JSON.stringify(q),before);
});

test('explicit Project Start reschedules CAD and production without changing activation, finish or hours',()=>{
 const q=createBlankQuoteV27();q.schedule={buildStart:'2026-11-02',buildFinish:'2026-11-27',installDate:'',status:'Closed won',projectStatus:'Active'};
 q.takeoffs=[];q.lines[0].overrides.hours=24;q.lines.find(l=>l.type==='Design / Engineering / CAD')!.overrides.hours=16;
 const source={activationDate:'2026-11-02',workspaceId:'test',workspace:'Test',version:1,document:q};
 const roster=[{...person,primary:'Unassigned shop hours',rate:20,notes:''}],o={...options,start:'2026-11-02',finish:'2026-11-27'};
 const original=buildTeamSchedule([source],roster,o,true);
 const revised=structuredClone(source);revised.version=2;revised.document.schedule={...q.schedule,buildStart:'2026-11-09',projectStartOverride:'2026-11-09'};
 const result=buildTeamSchedule([revised],roster,o,true);
 assert.equal(capacityProject(revised).schedule.buildStart,'2026-11-09');
 assert.equal(result.preparation[0].start,'2026-11-09');assert.equal(result.preparation[0].hours,16);
 assert.equal(result.totalHours,original.totalHours);assert.equal(result.assignedHours,24);
 assert.ok(result.allocations.every(a=>a.date>'2026-11-09'&&a.date<='2026-11-27'));
 assert.equal(revised.activationDate,'2026-11-02');assert.equal(source.document.schedule?.buildStart,'2026-11-02');
 const approved={...emptyPlan(),status:'approved' as const,quoteVersion:1,tasks:proposeProductionPlan(q,roster).tasks};
 const prior=JSON.stringify(approved),r=buildTeamSchedule([{...revised,productionPlan:approved}],roster,o,true);
 assert.equal(r.assignedHours,24);assert.equal(JSON.stringify(approved),prior);assert.ok(r.warnings.some(w=>w.includes('saved approved plan')));
});

import {parseSchedule,effectiveProjectSchedule} from '../src/lib/quote-schedule';
test('revised start survives validation; legacy starts and activation fallback stay compatible',()=>{
 const base={buildStart:'2026-11-02',buildFinish:'2026-11-27',installDate:'',status:''};
 assert.equal(effectiveProjectSchedule(parseSchedule(base),'2026-11-05').buildStart,'2026-11-05');
 const revised=parseSchedule({...base,buildStart:'2026-11-09',projectStartOverride:'2026-11-09'});
 assert.equal(effectiveProjectSchedule(revised,'2026-11-05').buildStart,'2026-11-09');
 assert.throws(()=>parseSchedule({...base,projectStartOverride:'2026-11-10'}),/must match/);
 assert.throws(()=>parseSchedule({...base,buildStart:'2026-11-30',projectStartOverride:'2026-11-30'}),/Finish/);
});
