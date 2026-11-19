import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesSalesperson,quoteSalesperson,salespersonOptions} from '../src/lib/quote-salesperson';
import {groupQuoteVersions} from '../src/lib/quote-version-groups';
test('salesperson filter distinguishes unassigned, exact names and custom names',()=>{
 assert.equal(quoteSalesperson(null),'');assert.equal(quoteSalesperson(' Maria Mecca '),'Maria Mecca');
 assert.ok(matchesSalesperson(undefined,'unassigned'));assert.ok(matchesSalesperson('','all'));
 assert.ok(matchesSalesperson('Paul Mecca','person:Paul Mecca'));assert.equal(matchesSalesperson('Maria Mecca','person:Paul Mecca'),false);
 assert.ok(matchesSalesperson('Outside Sales','person:Outside Sales'));
 const options=salespersonOptions([' Maria Mecca ','Outside Sales',null,'Outside Sales']);assert.equal(options.filter(x=>x==='Maria Mecca').length,1);assert.ok(options.includes('Outside Sales'));assert.equal(options.includes(''),false);
});
test('salesperson matches older grouped versions and sorting retains newest primary',()=>{
 const rows=[{id:'old',capacity_group:'g',capacity_selected:false,created_at:'2026-01-01',salesperson:'Paul Mecca'},{id:'new',capacity_group:'g',capacity_selected:true,created_at:'2026-02-01',salesperson:'Maria Mecca'},{id:'other',capacity_group:'h',capacity_selected:true,created_at:'2026-01-01',salesperson:'Carlos Chaidez'}];
 const groups=groupQuoteVersions(rows,w=>matchesSalesperson(w.salesperson,'person:Paul Mecca'),(a,b)=>a.salesperson.localeCompare(b.salesperson));assert.equal(groups.length,1);assert.equal(groups[0].primary.id,'new');assert.equal(groups[0].others[0].id,'old');
 const sorted=groupQuoteVersions(rows,()=>true,(a,b)=>a.salesperson.localeCompare(b.salesperson));assert.equal(sorted[0].primary.salesperson,'Carlos Chaidez');
});

import {salespersonProjectIds,filterTeamProjects} from '../src/lib/capacity-salesperson';
import type {TeamResult} from '../src/lib/team-schedule';
test('capacity salesperson IDs intersect manual selections and preserve all-project default',()=>{
 const projects=[{workspaceId:'a',document:{salesperson:'Paul Mecca'}},{workspaceId:'b',document:{salesperson:'Maria Mecca'}},{workspaceId:'c'}];
 assert.equal(salespersonProjectIds(projects,'all'),null);
 assert.deepEqual(salespersonProjectIds(projects,'person:Paul Mecca'),['a']);
 assert.deepEqual(salespersonProjectIds(projects,'person:Paul Mecca',['b']),[]);
 assert.deepEqual(salespersonProjectIds(projects,'unassigned'),['c']);
 assert.deepEqual(salespersonProjectIds(projects,'person:No match'),[]);
});
test('team filter narrows all project detail and totals without reallocating shared staff',()=>{
 const result={projects:[{id:'a',name:'A',status:'Active'},{id:'b',name:'B',status:'Active'}],
 allocations:[{workspaceId:'a',hours:4,date:'2026-11-19',personId:'p',project:'A',item:'wall',trade:'paint'},{workspaceId:'b',hours:7,date:'2026-11-20',personId:'p',project:'B'}],
 unfilled:[{taskKey:'a|1',hours:6,futureHours:2},{taskKey:'b|1',hours:10}],
 preparation:[{workspaceId:'a'},{workspaceId:'b'}],crewAdjustments:[{project:'A',item:'wall',trade:'paint',date:'2026-11-19'},{project:'B'}],
 warnings:['shared warning'],pressure:[{projects:['A','B'],utilization:1}],assignedHours:11,totalHours:27,people:[],options:{}
 } as unknown as TeamResult&{projects:{id:string;name:string;status:string}[]};
 const filtered=filterTeamProjects(result,['a'])!;
 assert.equal(filtered.assignedHours,4);assert.equal(filtered.totalHours,10);
 assert.equal(filtered.projects.length,1);assert.equal(filtered.preparation?.length,1);assert.equal(filtered.crewAdjustments?.length,1);
 assert.equal(filtered.allocations[0],result.allocations[0]);assert.equal(filtered.unfilled[0].futureHours,2);
 assert.equal(filtered.pressure,result.pressure);assert.equal(filtered.warnings,result.warnings);
 assert.equal(result.assignedHours,11);assert.equal(filterTeamProjects(result,null),result);
 const empty=filterTeamProjects(result,[])!;assert.equal(empty.totalHours,0);assert.equal(empty.projects.length,0);assert.equal(empty.allocations.length,0);
});
