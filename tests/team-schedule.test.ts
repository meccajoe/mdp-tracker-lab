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
