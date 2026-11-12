import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chicagoClock,eligibleQuote,prepareBaseline,runProjectSync} from '../src/lib/lab-project-sync';
import {sourceReader,approvedDefinition,qualifyCostDefinition,activityExportQuery,readDeal} from '../src/lib/lab-project-sync-source';
const quote=JSON.parse(readFileSync('src/data/quote-v27-fonroche.json','utf8'));
test('6 a.m. Chicago follows standard/daylight time; other UTC trigger skips',()=>{
 assert.equal(chicagoClock(new Date('2026-11-12T12:00:00Z')).hour,6);assert.equal(chicagoClock(new Date('2026-07-12T11:00:00Z')).hour,6);
 assert.equal(chicagoClock(new Date('2026-07-12T12:00:00Z')).hour,7);assert.equal(chicagoClock(new Date('2026-11-12T11:00:00Z')).hour,5);
 assert.equal(chicagoClock(new Date('2026-11-12T00:00:00Z')).day,'2026-11-11');
});
test('only won active discovery; legacy production overrides complete; open/completed omitted',()=>{
 for(const status of ['Possible','Likely','Lost','Completed'])assert.equal(eligibleQuote({document:{schedule:{status,projectStatus:'Active'}}}),false);
 assert.equal(eligibleQuote({document:{schedule:{status:'Closed won',projectStatus:'Active'}}}),true);
 assert.equal(eligibleQuote({document:{schedule:{status:'Closed won',projectStatus:'Complete'}}}),false);
 assert.equal(eligibleQuote({document:{schedule:{status:'Closed won',projectStatus:'Not Active'}}}),false);
 assert.equal(eligibleQuote({document:{schedule:{projectStatus:'Complete'},planning:{status:'In production'}}}),true);
});
test('source adapter only targets the fixed read-only API and rejects unscoped tokens or incomplete responses',async()=>{
 assert.throws(()=>sourceReader('legacy-token'));
 let calls=0;const query=sourceReader('sbp_fc_fixture',async(url,options)=>{calls++;assert.equal(url,'https://api.supabase.com/v1/projects/yaftybqzlbbvzwwdzlny/database/query/read-only');assert.equal(options?.redirect,'error');assert.deepEqual(JSON.parse(options!.body as string),{query:'select 1'});return Response.json([{value:1}]);});
 assert.deepEqual(await query('select 1'),[{value:1}]);assert.equal(calls,1);
 await assert.rejects(()=>sourceReader('sbp_fc_fixture',async()=>Response.json({rows:[]}))('select 1'));
 await assert.rejects(()=>sourceReader('sbp_fc_fixture',async()=>new Response('PRIVATE',{status:403}))('select 1'),/SOURCE_READ_FAILED/);
 await assert.rejects(()=>approvedDefinition(async()=>[{definition:'WITH changed AS (SELECT 1) SELECT 1'}]),/COSTING_RULES_CHANGED/);
});
test('source SQL qualifies persistent references, retains single capture/cost query and rejects unsafe IDs',()=>{
 assert.equal(qualifyCostDefinition('FROM qbo_labor_entries labor JOIN public.labor_rate_imports i ON normalize_labor_worker_name(labor.employee_name)=i.name'),'FROM public.qbo_labor_entries labor JOIN public.labor_rate_imports i ON public.normalize_labor_worker_name(labor.employee_name)=i.name');
 const sql=activityExportQuery('job-1','select null costing_export');assert.ok(sql.includes('public.expenses'));assert.ok(sql.includes('public.project_actuals'));assert.ok(sql.includes('public.labor_entries'));assert.ok(sql.includes('now()'));assert.throws(()=>activityExportQuery("job';drop table x",''));
});
test('CRM field mapping is explicit; quotes are references with separate totals and identities',async()=>{
 const calls:string[]=[];
 const fetcher:typeof fetch=async(url)=>{calls.push(String(url));return Response.json(calls.length===1?{id:'456',properties:{dealname:'Exact Name  ',job_number:'123',account_manager:'Greg Mayberry',closedate:'2026-11-01T12:00:00Z',due_date:'2026-12-01',amount:'100'},associations:{quotes:{results:[{id:'789'}]}}}:{id:'789',properties:{hs_title:'Client quote',hs_quote_amount:'110',hs_status:'PUBLISHED',hs_quote_link:'https://example.test/quote'}});};
 const deal=await readDeal('456','fixture',fetcher);assert.equal(deal.name,'Exact Name  ');assert.equal(deal.pm,'GM');assert.equal(deal.closeDate,'2026-11-01');assert.equal(deal.hubspot.quotes[0].total,110);assert.equal(deal.hubspot.amount,100);assert.equal(calls.length,2);
 await assert.rejects(()=>readDeal('456','fixture',async()=>Response.json({id:'456',properties:{dealname:'Name',job_number:'123',account_manager:'Unknown manager',closedate:null,due_date:null,amount:null}})),/PM_MAPPING_REQUIRED/);
 await assert.rejects(()=>readDeal('456','fixture',async()=>Response.json({id:'456',properties:{dealname:'Name',job_number:'123',account_manager:null,closedate:null,due_date:null,amount:null},associations:{quotes:{paging:{next:{}}}}})),/QUOTES_TRUNCATED/);
});
test('new baseline uses saved quote arithmetic without changing the quote',()=>{
 const document=quote.document??quote.quote??quote;
 const before=JSON.stringify(document);const baseline=prepareBaseline({document},{name:'Canonical',hubspot:{amount:1,quotes:[]}});
 assert.equal(baseline.title,'Canonical');assert.ok(baseline.totals.price>0);assert.ok(baseline.lines.length>0);assert.equal(JSON.stringify(document),before);
});
test('runner respects global overlap claim and records fatal source failures without touching projects',async()=>{
 const calls:string[]=[];
 const db={async rpc(name:string){calls.push(name);return {data:null,error:null};}};
 const result=await runProjectSync({db,query:async()=>{throw Error('must not read');},hubspotToken:'fixture',mode:'manual'});assert.equal(result.skipped,true);assert.deepEqual(calls,['lab_claim_project_sync']);
 calls.length=0;
 const args:any[]=[];const failing={async rpc(name:string,arg:any){calls.push(name);args.push(arg);return {data:name==='lab_claim_project_sync'?'run':null,error:null};}};
 const failed=await runProjectSync({db:failing,query:async()=>{throw Error('private source error');},hubspotToken:'fixture',mode:'manual'});assert.equal(failed.failed,true);assert.deepEqual(calls,['lab_claim_project_sync','lab_finish_project_sync']);assert.equal(args[1].p_code,'RUN_FAILED');assert.equal(JSON.stringify(args).includes('private source error'),false);
});
