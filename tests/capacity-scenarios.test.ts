import test from 'node:test';import assert from 'node:assert/strict';
import {parsePlanningScenario} from '../src/lib/capacity-scenarios';
const id='00000000-0000-4000-8000-000000000001';
const base=()=>({name:' Later start ',start:'2026-11-02',count:8,selected:[id,id],dates:{[id]:{buildStart:'2026-11-30',buildFinish:'2026-12-18',installDate:''}}});
test('scenario round trip keeps dates and range, deduplicates IDs, isolates input',()=>{const v=base(),parsed=parsePlanningScenario(v);assert.equal(parsed.name,'Later start');assert.deepEqual(parsed.selected,[id]);assert.deepEqual(parsePlanningScenario(JSON.parse(JSON.stringify(parsed))),parsed);parsed.dates[id].buildStart='2026-12-01';assert.equal(v.dates[id].buildStart,'2026-11-30');});
test('reject invalid names, IDs, ranges and unselected or reversed date overrides',()=>{for(const patch of [{name:' '},{count:3},{start:'bad'},{selected:['bad']},{selected:[]},{dates:{[id]:{buildStart:'2026-12-18',buildFinish:'2026-11-30',installDate:''}}}])assert.throws(()=>parsePlanningScenario({...base(),...patch}));});
test('empty committed-only scenario is saveable',()=>assert.equal(parsePlanningScenario({...base(),selected:[],dates:{}}).selected.length,0));
