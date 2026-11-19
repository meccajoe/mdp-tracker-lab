const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Cache-Control':'private, no-store'}});
function load(file,imports,extra={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:name=>{assert.ok(imports[name],name);return imports[name];},process:{env:{}},Buffer,URL,...extra});return module.exports;}
test('manual sync endpoints require Lab admin; preview/apply explicit; log queries fail closed',async()=>{
 let blocked=false,auth=false,admin=false,configured=false,failed=false;const calls=[];
 const db={from(table){calls.push(table);return {select(){return this},order(){return this},limit(){return this},eq(){return this},then(resolve){return Promise.resolve(failed?{error:{message:'PRIVATE'}}:{data:table==='lab_project_sync_runs'?[{id:'run'}]:[]}).then(resolve)}}}};
 const api=load('src/app/api/lab-project-sync/route.ts',{
 '@/lib/ada-server':{requireQuoteProductAccess:async()=>auth?{ok:true,actorRole:admin?'admin':'pm',supabase:db}:{ok:false,response:json({error:'auth'},401)}},
 '@/lib/quote-management-server':{labManagementGuard:()=>blocked?json({error:'lab'},403):null,managementJson:json},
 './server':{syncConfigured:()=>configured,executeSync:async mode=>{calls.push(mode);return {runId:'run'}}},
 });
 blocked=true;assert.equal((await api.GET()).status,403);assert.equal(calls.length,0);blocked=false;
 assert.equal((await api.GET()).status,401);auth=true;assert.equal((await api.GET()).status,403);admin=true;
 let response=await api.GET();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal((await response.json()).configured,false);
 const request=action=>new Request('https://lab/api/lab-project-sync',{method:'POST',body:JSON.stringify({action})});
 assert.equal((await api.POST(request('apply'))).status,503);configured=true;
 assert.equal((await api.POST(request('invalid'))).status,400);
 assert.equal((await api.POST(request('preview'))).status,200);assert.equal(calls.at(-1),'preview');assert.equal((await api.POST(request('apply'))).status,200);assert.equal(calls.at(-1),'manual');
 failed=true;response=await api.GET();assert.equal(response.status,503);assert.equal((await response.text()).includes('PRIVATE'),false);
});
test('scheduled sync rejects missing/incorrect secrets, respects enable and Chicago window',async()=>{
 const env={},calls=[];let hour=6,configured=true;
 const api=load('src/app/api/lab-project-sync/scheduled/route.ts',{
 'node:crypto':require('node:crypto'),
 '@/lib/quote-management-server':{labManagementGuard:()=>null,managementJson:json},
 '@/lib/lab-project-sync':{chicagoClock:()=>({hour})},
 '../server':{syncConfigured:()=>configured,executeSync:async mode=>{calls.push(mode);return {runId:'run'}}},
 },{process:{env}});
 const request=token=>new Request('https://lab/api/lab-project-sync/scheduled',{headers:token?{authorization:'Bearer '+token}:{}});
 assert.equal((await api.GET(request())).status,401);env.CRON_SECRET='x'.repeat(32);
 assert.equal((await api.GET(request('x'.repeat(31)+'é'))).status,401);assert.equal(calls.length,0);
 let response=await api.GET(request(env.CRON_SECRET));assert.equal((await response.json()).reason,'DISABLED');env.LAB_DAILY_SYNC_ENABLED='true';hour=7;
 response=await api.GET(request(env.CRON_SECRET));assert.equal((await response.json()).reason,'OUTSIDE_CHICAGO_WINDOW');hour=6;configured=false;
 assert.equal((await api.GET(request(env.CRON_SECRET))).status,503);configured=true;
 assert.equal((await api.GET(request(env.CRON_SECRET))).status,200);assert.deepEqual(calls,['scheduled']);
 hour=12;for(const mode of ['manual','preview']){const r=new Request('https://lab/api/lab-project-sync/scheduled?mode='+mode,{headers:{authorization:'Bearer '+env.CRON_SECRET}});assert.equal((await api.GET(r)).status,200);assert.equal(calls.at(-1),mode);}
 assert.equal((await api.GET(new Request('https://lab/api/lab-project-sync/scheduled?mode=manual'))).status,401);
 assert.equal((await api.GET(new Request('https://lab/api/lab-project-sync/scheduled?mode=invalid',{headers:{authorization:'Bearer '+env.CRON_SECRET}}))).status,400);
});
test('mixed-scope runner previews without publishing, isolates failed links and preserves existing baselines',async()=>{
 const source={group_id:'existing',workspace_id:'w1',project_id:'p1',linked_deal_id:'1',linked_job_number:'10',revision:4,document:{schedule:{status:'Completed'}}};
 const fresh={group_id:'new',workspace_id:'w2',hubspot_deal_id:'2',job_number:null,revision:1,document:{schedule:{status:'Closed won',projectStatus:'Active'}}};
 const complete={...fresh,group_id:'complete',workspace_id:'w3',hubspot_deal_id:'3',job_number:'30',document:{schedule:{status:'Closed won',projectStatus:'Complete'}}};
 const unresolved={...fresh,group_id:'unlinked',hubspot_deal_id:null};
 const open={...fresh,group_id:'open',document:{schedule:{status:'Possible',projectStatus:'Active'}}};
 const calls=[];let baselineCalls=0;
 class SyncIssue extends Error{constructor(code){super(code);this.code=code}}
 const api=load('src/lib/lab-project-sync.ts',{
 './quote-v27':{calculateQuoteV27:()=>{baselineCalls++;return {laborRate:20,lines:[],totals:{price:100}}}},
 './quote-v27-validation':{parseQuoteV27:x=>x},
 './quote-schedule':{projectStatusFor:s=>s.projectStatus},
 './lab-project-rate-approvals':{applyLabRateApprovals:(_capture,evidence,approvals)=>{assert.equal(approvals.length,0);return evidence;}},
 './lab-project-sync-source':{approvedDefinition:async()=>'',sha:()=>'',SyncIssue,
  quoteIdentityKey:row=>row.client_name==='Game Seven'?'same-fixture-identity':row.title||'',
  resolveProjectLink:async(_query,row)=>{if(row.client_name==='Game Seven')return {dealId:'4',jobNumber:'40'};if(!row.hubspot_deal_id)throw new SyncIssue('MISSING_DEAL_OR_JOB');return {dealId:row.hubspot_deal_id,jobNumber:row.job_number}},
  readDeal:async deal=>({dealId:deal,jobNumber:deal==='1'?'10':deal==='2'?'20':'30',name:'Canonical'}),
  readActivity:async()=>({capture:{expenses:[],labor:[]},evidence:{expected:{hours:0,knownCost:0,missingHours:0}}})},
 },{Intl,Date,Set,fetch});
 let dataset=[source,fresh,complete,unresolved,open];
 const db={async rpc(name,args){calls.push({name,args});return {data:name==='lab_claim_project_sync'?'run':name==='lab_project_rate_approvals'?[]:name==='lab_project_sync_scope_v2'?dataset:name==='lab_project_sync_document'?[fresh,complete].find(row=>row.workspace_id===args.p_workspace).document:null,error:null}}};
 await api.runProjectSync({db,query:async()=>[],hubspotToken:'fixture',mode:'preview'});
 assert.equal(calls.some(c=>c.name==='lab_apply_project_sync'),false);assert.equal(calls.filter(c=>c.name==='lab_record_project_sync_result'&&c.args.p_outcome==='preview').length,3);assert.equal(calls.find(c=>c.args?.p_scope==='unlinked').args.p_code,'MISSING_DEAL_OR_JOB');assert.equal(baselineCalls,2);
 calls.length=0;baselineCalls=0;await api.runProjectSync({db,query:async()=>[],hubspotToken:'fixture',mode:'manual'});
 const writes=calls.filter(c=>c.name==='lab_apply_project_sync');assert.equal(writes.length,3);assert.equal(writes.find(c=>c.args.p_scope==='existing').args.p_payload.baseline,null);assert.equal(writes.find(c=>c.args.p_scope==='new').args.p_payload.baseline.totals.price,100);assert.equal(baselineCalls,2);assert.equal(writes.find(c=>c.args.p_scope==='complete').args.p_payload.baseline.sourceProjectStatus,'Completed');
 assert.equal(calls.filter(c=>c.name==='lab_project_sync_document').length,2);assert.equal(calls.some(c=>c.args?.p_scope==='open'),false);assert.equal(calls.at(-1).args.p_failed,false);
 calls.length=0;const failedLog={async rpc(name,args){if(name==='lab_record_project_sync_result'&&args.p_outcome==='exception'){calls.push({name,args});return {error:{code:'57014'},data:null}}return db.rpc(name,args)}};const failure=await api.runProjectSync({db:failedLog,query:async()=>[],hubspotToken:'fixture',mode:'manual'});assert.equal(failure.failed,true);assert.equal(calls.at(-1).args.p_code,'RESULT_LOG_FAILED');
 calls.length=0;dataset=[{...fresh,title:'Big 12 Pop Up',client_name:'Game Seven',hubspot_deal_id:null},{...fresh,group_id:'other-group',workspace_id:'other-workspace',title:'Game Seven - Big 12 Pop Up',client_name:'Game Seven',hubspot_deal_id:null}];await api.runProjectSync({db,query:async()=>[],hubspotToken:'fixture',mode:'preview'});assert.equal(calls.some(c=>c.name==='lab_apply_project_sync'),false);assert.equal(calls.filter(c=>c.args?.p_code==='PROJECT_LINK_CONFLICT').length,2);
});
