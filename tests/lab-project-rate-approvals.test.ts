import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLabRateApprovals,type LabRateApproval} from '../src/lib/lab-project-rate-approvals';
import type {ActivityCapture} from '../src/lib/lab-project-activity';
import {attachProjectCosting,type ProjectCostingPacket} from '../src/lib/lab-project-costing';
import {summarizeProjectActivity} from '../src/lib/lab-project-activity';
const hash='a'.repeat(64),at='2026-11-16T18:00:00Z';
const approval=(workerId=1):LabRateApproval=>({id:'approval-'+workerId,workerId,canonicalName:'First Last',allowedNames:['First Last','Last First'],hourlyRate:24,effectiveStart:'0001-01-01',effectiveEnd:null,approvedBy:'Lab owner',approvedAt:at,sourceLabel:'Payroll confirmed; owner approved historical assumption',sourceRefs:['https://example.test/approval']});
function fixture(){
 const rows=[1,2,3].map((id)=>({entryId:'ts_'+id,employeeName:id===2?'Last First':'First Last',workerId:id,normalizedName:'first last',date:'2026-10-01',regHours:1.25,otHours:0.5,basis:'missing' as const,source:null,hourlyRate:null,dailyRate:null,amount:null,verifiedAt:null,approval:null}));
 const capture:ActivityCapture={version:1,source:'production-tracker',capturedAt:at,project:{id:'123',job_number:'123',hubspot_deal_id:'456',name:'Fixture',contract_amount:100,budget_hrs:10,budget_materials:50,budget_design:null,budget_id_labor:null},expenses:[],manualLabor:[],manualActuals:[],labor:rows.map(r=>({qbo_entry_id:r.entryId,employee_name:r.employeeName,date:r.date,service_item:'SHOP LABOR',reg_hours:r.regHours,ot_hours:r.otHours,hourly_rate:null,rate_source:null,rate_verified_at:null}))};
 const packet:ProjectCostingPacket={version:1,activitySnapshotId:'snap',activitySourceSha256:hash,sourceProjectId:'123',jobNumber:'123',dealId:'456',resolvedAt:'2026-11-15T12:00:00Z',sourceView:'public.project_labor_reconciliation_summary',sourceViewSha256:hash,expected:{rows:3,hours:5.25,knownCost:0,missingHours:5.25,excludedHours:0},rows};
 return {capture,packet};
}
test('approved IDs and explicit aliases fill historical gaps without mutating source or unrelated workers',()=>{
 const {capture,packet}=fixture(),before=JSON.stringify({capture,packet});
 const next=applyLabRateApprovals(capture,packet,[approval(1),approval(2)],at);
 assert.equal(JSON.stringify({capture,packet}),before);
 assert.equal(next.expected.knownCost,84);assert.equal(next.expected.missingHours,1.75);
 assert.equal(next.rows[0].amount,42);assert.equal(next.rows[1].amount,42);assert.equal(next.rows[2].basis,'missing');
 assert.equal(next.rows[1].employeeName,'Last First');assert.equal(next.rows[1].normalizedName,'first last');
 assert.deepEqual(next.labApproval?.sourceExpected,packet.expected);assert.match(next.labApproval!.sourceCostingSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(next.labApproval?.rateApprovalIds,['approval-1','approval-2']);
 const s=summarizeProjectActivity(attachProjectCosting(capture,next,'snap',hash));assert.equal(s.knownCost,84);assert.equal(s.missingHours,1.75);
 assert.equal(applyLabRateApprovals(capture,next,[approval(1),approval(2)],at),next);
});
test('later source rates take precedence and empty approvals do not revalue evidence',()=>{
 const {capture,packet}=fixture();
 packet.rows[0]={...packet.rows[0],basis:'hourly',source:'qbo_time_users',hourlyRate:30,amount:52.5,verifiedAt:at};
 packet.expected.knownCost=52.5;packet.expected.missingHours=3.5;
 assert.equal(applyLabRateApprovals(capture,packet,[approval(1)],at),packet);
 assert.equal(applyLabRateApprovals(capture,packet,[],at),packet);
});
test('dates bound approvals, identity drift and overlapping approvals fail closed',()=>{
 const {capture,packet}=fixture();const a=approval();a.effectiveStart='2026-10-02';
 assert.equal(applyLabRateApprovals(capture,packet,[a],at),packet);
 a.effectiveStart='2026-09-01';a.effectiveEnd='2026-09-30';assert.equal(applyLabRateApprovals(capture,packet,[a],at),packet);
 a.effectiveEnd=null;a.allowedNames=['Different Person'];assert.throws(()=>applyLabRateApprovals(capture,packet,[a],at),/identity/);
 assert.throws(()=>applyLabRateApprovals(capture,packet,[approval(),approval()],at),/Conflicting/);
});
test('invalid approvals or already-corrupt source evidence cannot become approved costs',()=>{
 const {capture,packet}=fixture();for(const patch of [{hourlyRate:0},{hourlyRate:NaN},{approvedBy:''},{sourceRefs:[]},{effectiveStart:'not-date'},{workerId:1.1}])assert.throws(()=>applyLabRateApprovals(capture,packet,[{...approval(),...patch}],at));
 packet.expected.hours=1;assert.throws(()=>applyLabRateApprovals(capture,packet,[approval()],at));
});

test('confirmed ID-bound approval can replace a design policy without guessing unmatched identity',()=>{
 const {capture,packet}=fixture();packet.rows[0]={...packet.rows[0],basis:'hourly',source:'fixed_design_rate',hourlyRate:41,dailyRate:null,amount:71.75,approval:{id:'policy',approvedBy:'Owner',approvedAt:at,effectiveStart:'1900-01-01',effectiveEnd:null}};packet.expected.knownCost=71.75;packet.expected.missingHours=3.5;
 const before=JSON.stringify(packet);assert.equal(applyLabRateApprovals(capture,packet,[],at),packet);
 const next=applyLabRateApprovals(capture,packet,[approval(1)],at);assert.equal(next.rows[0].source,'approved_historical_payroll_rate');assert.equal(next.rows[0].amount,42);assert.equal(JSON.stringify(packet),before);
 packet.rows[0].workerId=null;assert.equal(applyLabRateApprovals(capture,packet,[approval(1)],at),packet);
});
