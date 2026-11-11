import test from 'node:test';
import assert from 'node:assert/strict';
import {attachProjectCosting,validateProjectCosting,roundedCostSum,type ProjectCostingPacket,type ApprovedLaborCost} from '../src/lib/lab-project-costing';
import {summarizeProjectActivity,type ActivityCapture} from '../src/lib/lab-project-activity';
import {directoryProject} from '../src/lib/lab-project-directory';
import {approvedCostingQuery} from '../scripts/lab/approved-costing-query';
const hash='a'.repeat(64);
const approval=()=>({id:'rule',approvedBy:'Payroll approver',approvedAt:'2026-10-01T12:00:00Z',effectiveStart:'2026-10-01',effectiveEnd:null,importId:'import',sourceSha256:hash});
function fixture(){
 const rows:ApprovedLaborCost[]=[
  {entryId:'ts_1',employeeName:'Hourly',workerId:1,normalizedName:'hourly',date:'2026-11-01',regHours:1,otHours:1,basis:'hourly',source:'payroll_rate_sheet',hourlyRate:25,dailyRate:null,amount:50,verifiedAt:null,approval:approval()},
  {entryId:'ts_2',employeeName:'Daily',workerId:2,normalizedName:'daily',date:'2026-11-01',regHours:4,otHours:0,basis:'daily',source:'approved_daily_rate',hourlyRate:null,dailyRate:200,amount:200,verifiedAt:null,approval:approval()},
  {entryId:'ts_3',employeeName:'Daily',workerId:2,normalizedName:'daily',date:'2026-11-01',regHours:2,otHours:0,basis:'daily',source:'approved_daily_rate',hourlyRate:null,dailyRate:200,amount:0,verifiedAt:null,approval:approval()},
  {entryId:'ts_4',employeeName:'Salary',workerId:3,normalizedName:'salary',date:'2026-11-01',regHours:8,otHours:0,basis:'excluded',source:'salary_below_gross_profit',hourlyRate:null,dailyRate:null,amount:0,verifiedAt:null,approval:approval()},
  {entryId:'ts_5',employeeName:'Pending',workerId:4,normalizedName:'pending',date:'2026-11-01',regHours:3,otHours:0,basis:'missing',source:null,hourlyRate:null,dailyRate:null,amount:null,verifiedAt:null,approval:null},
 ];
 const capture:ActivityCapture={version:1,source:'production-tracker',capturedAt:'2026-11-02T12:00:00Z',project:{id:'123',job_number:'123',hubspot_deal_id:'456',name:'Pilot',contract_amount:1000,budget_hrs:30,budget_materials:100,budget_design:null,budget_id_labor:null},expenses:[],manualLabor:[],manualActuals:[],labor:rows.map(r=>({qbo_entry_id:r.entryId,employee_name:r.employeeName,date:r.date,reg_hours:r.regHours,ot_hours:r.otHours,hourly_rate:null,rate_source:null,rate_verified_at:null,service_item:'SHOP LABOR'}))};
 const packet:ProjectCostingPacket={version:1,activitySnapshotId:'snap',activitySourceSha256:hash,sourceProjectId:'123',jobNumber:'123',dealId:'456',resolvedAt:'2026-11-03T12:00:00Z',sourceView:'public.project_labor_reconciliation_summary',sourceViewSha256:hash,expected:{rows:5,hours:19,knownCost:250,missingHours:3,excludedHours:8},rows};
 return {capture,packet};
}
test('approved hourly, once-per-day, salary exclusion and genuine missing costs share one summary',()=>{
 const {capture,packet}=fixture(),before=JSON.stringify(capture),attached=attachProjectCosting(capture,packet,'snap',hash),s=summarizeProjectActivity(attached);
 assert.equal(JSON.stringify(capture),before);assert.equal(s.knownCost,250);assert.equal(s.hours,19);assert.equal(s.excludedHours,8);assert.equal(s.missingHours,3);assert.equal(s.missingEntries,1);assert.equal(s.complete,false);
 assert.deepEqual(s.exceptions,[{worker:'Pending',workerId:4,hours:3,entries:1,firstDate:'2026-11-01',lastDate:'2026-11-01'}]);
 const source={projects:{job_number:'123',hubspot_deal_id:'456'},snapshot:{totals:{price:1000,buildBudget:600,hoursAllowed:30}},workbook_revision:2};
 const activity={id:'snap',source_sha256:hash,job_number:'123',hubspot_deal_id:'456',snapshot:capture,captured_at:capture.capturedAt};
 const d=directoryProject(source,activity,{evidence:packet});assert.equal(d.activityState,'incomplete');assert.equal(d.cost,250);
 packet.jobNumber='wrong';assert.equal(directoryProject(source,activity,{evidence:packet}).activityState,'reconcile');
});
test('source decimal sums round once after aggregation, including half-cent boundary',()=>{
 assert.equal(roundedCostSum([5548.285,2720.11]),8268.40);assert.equal(roundedCostSum([0.1,0.2]),0.3);assert.equal(roundedCostSum([1e-7,0.0049999]),0.01);assert.equal(roundedCostSum([]),0);assert.throws(()=>roundedCostSum([-1]));
});
test('invalid identity, stale hours, incomplete coverage and totals never attach',()=>{
 const changes:((p:ProjectCostingPacket)=>void)[]=[p=>p.activitySnapshotId='other',p=>p.activitySourceSha256='b'.repeat(64),p=>p.sourceProjectId='other',p=>p.dealId='other',p=>p.rows[0].regHours=2,p=>p.rows[0].employeeName='wrong',p=>p.rows.pop(),p=>p.rows[1]=p.rows[0],p=>p.expected.knownCost=249,p=>p.expected.missingHours=0,p=>p.expected.hours=0];
 for(const change of changes){const {capture,packet}=fixture();change(packet);assert.throws(()=>validateProjectCosting(capture,packet,'snap',hash));}
});
test('approved rates require dated provenance; unsupported, fabricated or expired evidence fails',()=>{
 const changes:((r:ApprovedLaborCost)=>void)[]=[r=>r.approval=null,r=>r.approval!.approvedBy='',r=>r.approval!.approvedAt='invalid',r=>r.approval!.effectiveStart='2026-11-02',r=>r.approval!.effectiveEnd='2026-10-31',r=>r.approval!.sourceSha256='bad',r=>r.approval!.importId=null,r=>r.source='guessed_rate',r=>r.amount=49,r=>r.hourlyRate=0];
 for(const change of changes){const {capture,packet}=fixture();change(packet.rows[0]);assert.throws(()=>validateProjectCosting(capture,packet,'snap',hash));}
 for(const source of ['fixed_design_rate','approved_contractor_rate','approved_historical_payroll_rate']){const {capture,packet}=fixture();packet.rows[0].source=source;validateProjectCosting(capture,packet,'snap',hash);}
 const {capture,packet}=fixture();packet.rows[0].source='qbo_time_users';packet.rows[0].approval=null;assert.throws(()=>validateProjectCosting(capture,packet,'snap',hash));packet.rows[0].verifiedAt='2026-11-02';validateProjectCosting(capture,packet,'snap',hash);
});
test('daily charges cannot be doubled, skipped or assigned an hourly rate',()=>{
 for(const mutate of [(p:ProjectCostingPacket)=>p.rows[2].amount=200,(p:ProjectCostingPacket)=>p.rows[1].amount=0,(p:ProjectCostingPacket)=>p.rows[1].hourlyRate=25,(p:ProjectCostingPacket)=>p.rows[3].amount=1,(p:ProjectCostingPacket)=>p.rows[4].amount=0]){const {capture,packet}=fixture();mutate(packet);assert.throws(()=>validateProjectCosting(capture,packet,'snap',hash));}
});
test('raw snapshot cannot supply approved evidence without a separate packet',()=>{
 const {capture,packet}=fixture();capture.labor[0].approved_cost=packet.rows[0];capture.costing={resolvedAt:packet.resolvedAt,sourceView:packet.sourceView,sourceViewSha256:hash};
 const clean=attachProjectCosting(capture,null,'snap',hash);assert.equal(clean.costing,undefined);assert.equal(clean.labor[0].approved_cost,undefined);assert.equal(summarizeProjectActivity(clean).knownCost,0);
});
test('bounded read-only adapter rejects malformed scope or changed approved definition',()=>{
 const definition="WITH resolved AS (SELECT * FROM labor WHERE labor.qbo_entry_id ~~ 'ts_%'::text)\n SELECT project_id, count(*) FROM resolved GROUP BY project_id;";
 const query=approvedCostingQuery(definition,'123',['ts_1']);assert.ok(query.includes("labor.project_id='123'"));assert.ok(query.includes("ARRAY['ts_1']"));
 for(const ids of [[],['ts_1','ts_1'],["ts_1';drop table x"]])assert.throws(()=>approvedCostingQuery(definition,'123',ids));
 assert.throws(()=>approvedCostingQuery(definition+' DELETE FROM x','123',['ts_1']));assert.throws(()=>approvedCostingQuery('WITH resolved AS (SELECT 1)','123',['ts_1']));
});
