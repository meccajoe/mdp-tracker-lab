import test from 'node:test';import assert from 'node:assert/strict';
import {scheduleTeam,parseTeamOptions,type TeamTask,type TeamPerson,type TeamOptions} from '../src/lib/team-schedule';
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
