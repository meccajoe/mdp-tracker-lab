import test from 'node:test';import assert from 'node:assert/strict';
import {teamGanttRows,type GanttResult} from '../src/lib/team-gantt';
const result:GanttResult={options:{start:'2026-10-19',finish:'2026-10-23',priority:[],availability:[]},warnings:[],totalHours:15,assignedHours:8,people:[{id:'p1',name:'Pat',primary:'Paint',secondary:'',hours:40,active:true},{id:'p2',name:'Pat',primary:'Finish',secondary:'',hours:40,active:true}],projects:[{id:'a',name:'A',status:'Closed won'},{id:'b',name:'B',status:'In production'}],allocations:[{taskKey:'a|1',workspaceId:'a',project:'A',item:'Wall',trade:'Paint',personId:'p1',person:'Pat',date:'2026-10-19',hours:3,secondary:false},{taskKey:'a|2',workspaceId:'a',project:'A',item:'Wall',trade:'Finish',personId:'p2',person:'Pat',date:'2026-10-21',hours:5,secondary:false}],unfilled:[{taskKey:'b|1',project:'B',item:'Arch',trade:'Paint',hours:7,reason:'No capacity'}]};
const filter={project:'',person:'',trade:''};
test('default project lanes retain jobs with no assignments and preserve gaps and totals',()=>{const before=JSON.stringify(result),rows=teamGanttRows(result,'Project',filter);assert.equal(rows.length,2);assert.equal(rows[1].unassigned,7);assert.equal(rows[1].days.size,0);assert.equal(rows[0].days.has('2026-10-20'),false);assert.equal(rows.reduce((s,r)=>s+r.hours,0),8);assert.equal(JSON.stringify(result),before);});
test('trade grouping shares Finish/Paint and person grouping preserves distinct identities',()=>{const trades=teamGanttRows(result,'Trade',filter);assert.equal(trades.length,1);assert.equal(trades[0].name,'Finish / Paint');assert.equal(trades[0].hours,8);assert.equal(trades[0].unassigned,7);const people=teamGanttRows(result,'Person',filter);assert.equal(people.length,2);assert.deepEqual(people.map(p=>p.hours),[3,5]);assert.ok(people.every(p=>p.unassigned===0));});
test('filters narrow assignments without inventing ownership for unassigned hours',()=>{const rows=teamGanttRows(result,'Trade',{...filter,person:'p2'});assert.equal(rows[0].hours,5);assert.equal(rows[0].unassigned,0);assert.equal(teamGanttRows(result,'Project',{...filter,project:'b'})[0].hours,0);assert.equal(teamGanttRows(result,'Trade',{...filter,trade:'CNC'}).length,0);});

test('date view clips bars and assigned totals without changing saved assignments or hiding projects',()=>{
 const before=JSON.stringify(result),rows=teamGanttRows(result,'Project',{...filter,start:'2026-10-20',finish:'2026-10-22'});
 assert.equal(rows.length,2);assert.equal(rows[0].hours,5);assert.equal(rows[0].days.has('2026-10-19'),false);assert.equal(rows[1].unassigned,7);assert.equal(JSON.stringify(result),before);
});

import {projectPreparation} from '../src/lib/project-preparation';
test('CAD always fits first 15 percent without assigned people and turnover follows for 5 percent',()=>{
 const phases=projectPreparation('2026-11-02','2026-11-27',72,{saturday:false,sunday:false});
 assert.equal(phases[0].workdays,3);assert.equal(phases[0].start,'2026-11-02');assert.equal(phases[0].finish,'2026-11-04');
 assert.deepEqual(phases[0].daily.map(d=>d.hours),[24,24,24]);assert.match(phases[0].staffingNote,/3 CAD people/);
 assert.equal(phases[1].workdays,1);assert.equal(phases[1].start,'2026-11-05');assert.equal(phases[1].hours,null);
});
test('CAD fractional windows conserve hours, respect weekends and holidays, and never invent turnover hours',()=>{
 for(const calendar of [{saturday:false,sunday:false},{saturday:true,sunday:true},{saturday:true,sunday:false,holidays:['2026-11-02']}]){
  const phases=projectPreparation('2026-11-02','2026-11-06',5,calendar);
  assert.ok(Math.abs(phases[0].daily.reduce((s,d)=>s+d.hours!,0)-5)<1e-8);
  assert.ok(phases[1].daily.every(d=>d.hours===null));
  if(calendar.holidays)assert.equal(phases[0].start,'2026-11-03');
 }
 assert.deepEqual(projectPreparation('','',8,{saturday:false,sunday:false}),[]);
 const weekend=projectPreparation('2026-11-06','2026-11-23',80,{saturday:true,sunday:true});assert.ok(weekend[0].daily.some(d=>d.date==='2026-11-07'));
});
