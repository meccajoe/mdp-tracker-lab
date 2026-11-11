import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActivityCapture,summarizeProjectActivity,type ActivityCapture} from '../src/lib/lab-project-activity';
const fixture=():ActivityCapture=>({version:1,source:'production-tracker',capturedAt:'2026-11-10T12:00:00Z',project:{id:'job',name:'Pilot',job_number:'123',hubspot_deal_id:'456',contract_amount:100,budget_hrs:2,budget_materials:10,budget_design:null,budget_id_labor:null},manualLabor:[],manualActuals:[],expenses:[{id:'manual-1',date:'2026-11-10',amount:50,category:'Fabrication',vendor:'Vendor',source:'manual',external_id:null,notes:null,flagged:false,flag_note:null,amount_pending:false},{id:'credit',date:'2026-11-10',amount:-5,category:'Fabrication',vendor:'Vendor',source:'billcom',external_id:'bill1',notes:null,flagged:false,flag_note:null,amount_pending:true}],labor:[{qbo_entry_id:'ts_1',employee_name:'A',date:'2026-11-10',service_item:'SHOP LABOR',reg_hours:2,ot_hours:1,hourly_rate:20,rate_source:'qbo_time_users',rate_verified_at:'2026-11-10'},{qbo_entry_id:'ts_2',employee_name:'B',date:'2026-11-10',service_item:'DESIGN LABOR',reg_hours:4,ot_hours:0,hourly_rate:null,rate_source:null,rate_verified_at:null}]});
test('hours include unrated time; cost remains explicitly incomplete; credits retain sign',()=>{
 const f=fixture();validateActivityCapture(f);const s=summarizeProjectActivity(f);
 assert.equal(s.hours,7);assert.equal(s.knownCost,60);assert.equal(s.missingHours,4);assert.equal(s.missingEntries,1);assert.equal(s.complete,false);assert.equal(s.expenses,45);assert.equal(s.pendingExpenses,-5);assert.equal(s.groups.design.missingHours,4);assert.equal(s.groups.shop.hours,3);
});
test('unknown rate source never becomes verified merely because it has a number',()=>{
 const f=fixture();f.labor[1].hourly_rate=99;assert.equal(summarizeProjectActivity(f).knownCost,60);
 f.labor[1].rate_source='qbo_time_users_matched';assert.equal(summarizeProjectActivity(f).knownCost,456);assert.equal(summarizeProjectActivity(f).complete,true);
});
test('duplicate feed IDs and unsupported manual adjustments block a capture',()=>{
 for(const key of ['labor','expenses'] as const){const f=fixture();(f[key] as unknown[]).push(f[key][0]);assert.throws(()=>validateActivityCapture(f),/Duplicate/);}
 const f=fixture();f.manualActuals.push({category:'Materials',manual_amount:5});assert.throws(()=>validateActivityCapture(f),/reconciliation/);
});
test('noncanonical time, invalid numbers and malformed dates block a capture',()=>{
 let f=fixture();f.labor[0].qbo_entry_id='qbo_1';assert.throws(()=>validateActivityCapture(f),/canonical/);
 f=fixture();f.expenses[0].amount=NaN;assert.throws(()=>validateActivityCapture(f),/expense/);
 f=fixture();f.labor[0].reg_hours=-1;assert.throws(()=>validateActivityCapture(f),/canonical/);
});
