import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chicagoClock,eligibleQuote,prepareBaseline,runProjectSync} from '../src/lib/lab-project-sync';
import {sourceReader,approvedDefinition,qualifyCostDefinition,activityExportQuery,readDeal,resolveProjectLink,quoteIdentityKey,inlineWorkerNormalizer,NORMALIZER_HASH,sha} from '../src/lib/lab-project-sync-source';
const quote=JSON.parse(readFileSync('src/data/quote-v27-fonroche.json','utf8'));
test('6 a.m. Chicago follows standard/daylight time; other UTC trigger skips',()=>{
 assert.equal(chicagoClock(new Date('2026-11-12T12:00:00Z')).hour,6);assert.equal(chicagoClock(new Date('2026-07-12T11:00:00Z')).hour,6);
 assert.equal(chicagoClock(new Date('2026-07-12T12:00:00Z')).hour,7);assert.equal(chicagoClock(new Date('2026-11-12T11:00:00Z')).hour,5);
 assert.equal(chicagoClock(new Date('2026-11-12T00:00:00Z')).day,'2026-11-11');
});
test('won active and complete discovery; legacy lifecycle honored; open and Not Active omitted',()=>{
 for(const status of ['Possible','Likely','Lost'])assert.equal(eligibleQuote({document:{schedule:{status,projectStatus:'Active'}}}),false);
 assert.equal(eligibleQuote({document:{schedule:{status:'Closed won',projectStatus:'Active'}}}),true);
 assert.equal(eligibleQuote({document:{schedule:{status:'Closed won',projectStatus:'Complete'}}}),true);
 assert.equal(eligibleQuote({document:{schedule:{status:'Closed won',projectStatus:'Not Active'}}}),false);
 assert.equal(eligibleQuote({document:{schedule:{projectStatus:'Complete'},planning:{status:'In production'}}}),true);
 assert.equal(eligibleQuote({document:{schedule:{status:'Completed',projectStatus:'Active'}}}),true);
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
 assert.equal(baseline.title,'Canonical');assert.ok(baseline.totals.price>0);assert.ok(baseline.lines.length>0);
 assert.ok(baseline.budgetHandoff.workforceCandidates.length>0);
 assert.equal(baseline.budgetHandoff.lines.reduce((hours,line)=>hours+line.hoursAllowed,0),baseline.totals.hoursAllowed);
 assert.equal(JSON.stringify(document),before);
});
test('runner respects global overlap claim and records fatal source failures without touching projects',async()=>{
 const calls:string[]=[];
 const db={async rpc(name:string){calls.push(name);return {data:null,error:null};}};
 const result=await runProjectSync({db,query:async()=>{throw Error('must not read');},hubspotToken:'fixture',mode:'manual'});assert.equal(result.skipped,true);assert.deepEqual(calls,['lab_claim_project_sync']);
 calls.length=0;
 const args:any[]=[];const failing={async rpc(name:string,arg:any){calls.push(name);args.push(arg);return {data:name==='lab_claim_project_sync'?'run':null,error:null};}};
 const failed=await runProjectSync({db:failing,query:async()=>{throw Error('private source error');},hubspotToken:'fixture',mode:'manual'});assert.equal(failed.failed,true);assert.deepEqual(calls,['lab_claim_project_sync','lab_finish_project_sync']);assert.equal(args[1].p_code,'RUN_FAILED');assert.equal(JSON.stringify(args).includes('private source error'),false);
});

test('CRM sync shares the approved Production PM aliases and identifies quote access denials',async()=>{
 for(const [name,expected] of [['Nicholas Gonzales','NG'],['Destiny Freeman','DG'],[' greg   mayberry ','GM']]){
  const deal=await readDeal('456','fixture',async()=>Response.json({id:'456',properties:{dealname:'Canonical',job_number:'123',account_manager:name,closedate:null,due_date:null,amount:null}}));assert.equal(deal.pm,expected);
 }
 for(const [status,code] of [[403,'HUBSPOT_QUOTE_ACCESS_DENIED'],[404,'HUBSPOT_QUOTE_NOT_FOUND'],[429,'HUBSPOT_QUOTE_RATE_LIMITED']] as const){let call=0;await assert.rejects(()=>readDeal('456','fixture',async()=>++call===1?Response.json({id:'456',properties:{dealname:'Canonical',job_number:'123',account_manager:null,closedate:null,due_date:null,amount:null},associations:{quotes:{results:[{id:'789'}]}}}):new Response('PRIVATE',{status})),new RegExp(code));}
});

test('read-only export inlines exact approved worker rules without calling the restricted function',()=>{
 const body=readFileSync('tests/fixtures/lab-sync/approved-worker-normalizer.sql','utf8');assert.equal(sha(body.trim()),NORMALIZER_HASH);
 const definition='select public.normalize_labor_worker_name(labor.employee_name) from public.qbo_labor_entries labor where public.normalize_labor_worker_name(labor.employee_name) is not null';
 const sql=inlineWorkerNormalizer(definition,body);assert.equal(sql.includes('public.normalize_labor_worker_name('),false);assert.equal((sql.match(/WITH cleaned AS/g)||[]).length,2);assert.ok(sql.includes('COALESCE(labor.employee_name'));assert.ok(sql.includes("WHEN 'greg maslyk' THEN 'gregory maslyk'"));
 assert.throws(()=>inlineWorkerNormalizer(definition,body.replace('gregory maslyk','guessed person')),/RULES_CHANGED/);
 assert.throws(()=>inlineWorkerNormalizer('select public.normalize_labor_worker_name(other_name)',body),/CALL_CHANGED/);
 assert.throws(()=>inlineWorkerNormalizer(definition+' or public.normalize_labor_worker_name(other_name) is null',body),/CALL_CHANGED/);
});

test('identity discovery uses explicit deal, exact job or unique exact canonical name; never fuzzy matches',async()=>{
 let sql='';const query=async(q:string)=>{sql=q;return [{hubspot_deal_id:'456',job_number:'123',name:"Client's Job",client:'Client'}]};
 assert.deepEqual(await resolveProjectLink(async()=>{throw Error('no query needed')},{hubspot_deal_id:'456',job_number:null}),{dealId:'456',jobNumber:null});
 assert.deepEqual(await resolveProjectLink(query,{title:'Other',job_number:'123'}),{dealId:'456',jobNumber:'123'});assert.ok(sql.includes("p.job_number='123'"));
 await resolveProjectLink(query,{title:"  Client's   Job  "});assert.ok(sql.includes("'Client''s   Job'"));assert.ok(sql.includes('limit 3'));assert.equal(sql.includes('ilike'),false);
 await assert.rejects(()=>resolveProjectLink(async()=>[],{title:'No exact match'}),/MISSING_DEAL_OR_JOB/);
 await assert.rejects(()=>resolveProjectLink(async()=>[{hubspot_deal_id:'1',job_number:'2'},{hubspot_deal_id:'3',job_number:'4'}],{title:'Duplicated name'}),/AMBIGUOUS_PROJECT_LINK/);
 await assert.rejects(()=>resolveProjectLink(query,{job_number:"123';bad"}),/INVALID_JOB_LINK/);
});

test('distinctive name plus exact client recognizes Big 12 with punctuation/client-prefix differences',async()=>{
 const row={title:'Big 12 Pop-Up',client_name:'Game Seven'};let sql='';
 const query=async(q:string)=>{sql=q;return [{hubspot_deal_id:'360094393045',job_number:'26254',name:'Game Seven - Big 12 Pop Up',client:'Game Seven'}]};
 assert.deepEqual(await resolveProjectLink(query,row),{dealId:'360094393045',jobNumber:'26254'});
 assert.ok(sql.includes('p.client'));assert.ok(sql.includes("'Game Seven Big 12 Pop-Up'"));assert.equal(sql.includes('ilike'),false);
 assert.equal(quoteIdentityKey(row),quoteIdentityKey({title:'Game Seven - Big 12 Pop Up',client_name:'Game Seven'}));
 assert.notEqual(quoteIdentityKey(row),quoteIdentityKey({...row,client_name:'Another Client'}));
 for(const [name,client] of [['Game Seven - Big 12 Pop Up - Storage','Game Seven'],['Game Seven - Big 12 Pop Up','Another Client']]){
  await assert.rejects(()=>resolveProjectLink(async()=>[{hubspot_deal_id:'1',job_number:'2',name,client}],row),/SOURCE_IDENTITY_CHANGED/);
 }
 await assert.rejects(()=>resolveProjectLink(async()=>[{hubspot_deal_id:'1',job_number:'2',name:'Big 12 Pop Up',client:'Game Seven'},{hubspot_deal_id:'3',job_number:'4',name:'Game Seven - Big 12 Pop Up',client:'Game Seven'}],row),/AMBIGUOUS_PROJECT_LINK/);
});

test('a descriptive suffix is supported by unique client, due date and shared priced quote scope',async()=>{
 const row={title:'Whatnot TNT',client_name:'WAYLA',document:{schedule:{dueDate:'2026-11-25'}}};
 const candidate={hubspot_deal_id:'373033167596',job_number:'26256',name:'Whatnot TNT Box',client:'WAYLA',due_date:'2026-11-25',scope_quote_id:'352472355555',scope_lines:['TNT Box','Design, Engineering, CAD','Project Management']};
 let calls=0,scopeReads=0,sql='';
 const query=async(q:string)=>{calls++;sql=q;return calls===1?[]:[candidate]};
 const link=await resolveProjectLink(query,row,async()=>{scopeReads++;return ['TNT Box','Design, engineering & CAD']});
 assert.equal(link.dealId,'373033167596');assert.equal(link.jobNumber,'26256');assert.equal(link.evidence?.matchedLine,'TNT Box');assert.equal(link.evidence?.sourceQuoteId,'352472355555');assert.equal(scopeReads,1);assert.ok(sql.includes('p.due_date='));assert.ok(sql.includes('q.line_total>0'));assert.ok(sql.includes('q.source_id='));assert.equal(sql.includes('ilike'),false);
 async function attempt(patch:Record<string,unknown>,lines=['TNT Box']){let n=0;return resolveProjectLink(async()=>++n===1?[]:[{...candidate,...patch}],row,async()=>lines)}
 await assert.rejects(()=>attempt({client:'Other'}),/MISSING_DEAL_OR_JOB/);
 await assert.rejects(()=>attempt({due_date:'2026-11-26'}),/MISSING_DEAL_OR_JOB/);
 await assert.rejects(()=>attempt({scope_quote_id:null}),/MISSING_DEAL_OR_JOB/);
 await assert.rejects(()=>attempt({scope_lines:['Design, Engineering, CAD']}),/MISSING_DEAL_OR_JOB/);
 await assert.rejects(()=>attempt({name:'Whatnot TNT Box Storage',scope_lines:['TNT Box','Storage']}),/MISSING_DEAL_OR_JOB/);
 await assert.rejects(()=>attempt({scope_lines:['Box']},['Box']),/MISSING_DEAL_OR_JOB/);
 let n=0;await assert.rejects(()=>resolveProjectLink(async()=>++n===1?[]:[candidate,{...candidate,job_number:'other'}],row,async()=>['TNT Box']),/AMBIGUOUS_PROJECT_LINK/);
 let noDateQueries=0;await assert.rejects(()=>resolveProjectLink(async()=>{noDateQueries++;return []},{title:'Whatnot TNT',client_name:'WAYLA'},async()=>['TNT Box']),/MISSING_DEAL_OR_JOB/);assert.equal(noDateQueries,1);
});
