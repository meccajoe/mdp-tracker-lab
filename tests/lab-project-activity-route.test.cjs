const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('activity GET enforces Lab, identity, membership and latest capture; private failures stay private',async()=>{
 let blocked=false,authorized=false,member=false,failed=false,linked=true,valid=true,costFailed=false,costInvalid=false;
 const reads=[];const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Cache-Control':'private, no-store'}});
 const capture={project:{job_number:'123',hubspot_deal_id:'456'}};
 let activity=null;
 const actorSupabase={from(table){reads.push(table);return {select(){return this;},eq(key,value){assert.equal(value,key==='activity_snapshot_id'?'snap':'job');return this;},order(key,options){assert.equal(key,table==='lab_project_costing_snapshots'?'resolved_at':'captured_at');assert.equal(options.ascending,false);return this;},limit(n){assert.equal(n,1);return this;},async maybeSingle(){if(table==='lab_project_costing_snapshots')return costFailed?{error:{message:'PRIVATE'}}:{data:{evidence:costInvalid?'invalid':null}};return failed?{error:{message:'PRIVATE'},data:null}:{error:null,data:table==='lab_project_quote_sources'?(member?{workspace_id:'w'}:null):table==='projects'?{job_number:linked?'123':'999',hubspot_deal_id:'456'}:activity};}};}};
 const module={exports:{}};const imports={
 '@/lib/ada-server':{requireQuoteProductAccess:async()=>authorized?{ok:true,actorSupabase}:{ok:false,response:json({error:'auth'},401)}},
 '@/lib/quote-management-server':{labManagementGuard:()=>blocked?json({error:'lab'},403):null,managementJson:json},
 '@/lib/lab-project-costing':{attachProjectCosting:(snapshot,evidence)=>{if(evidence==='invalid')throw Error('PRIVATE');return snapshot;}},
 '@/lib/lab-project-activity':{validateActivityCapture:()=>{if(!valid)throw Error('PRIVATE');},summarizeProjectActivity:()=>({hours:7})}
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/projects/[id]/activity/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:name=>{assert.ok(imports[name]);return imports[name];}});
 const get=()=>module.exports.GET(new Request('https://lab/api/projects/job/activity'),{params:Promise.resolve({id:'job'})});
 blocked=true;assert.equal((await get()).status,403);assert.deepEqual(reads,[]);
 blocked=false;assert.equal((await get()).status,401);assert.deepEqual(reads,[]);
 authorized=true;assert.equal((await get()).status,404);assert.deepEqual(reads,['lab_project_quote_sources']);
 member=true;assert.deepEqual(await(await get()).json(),{activity:null});
 activity={id:'snap',source_sha256:'hash',job_number:'123',hubspot_deal_id:'456',snapshot:capture};let response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal((await response.json()).summary.hours,7);
 costFailed=true;assert.equal((await get()).status,503);costFailed=false;costInvalid=true;assert.equal((await get()).status,503);costInvalid=false;
 linked=false;assert.equal((await get()).status,409);linked=true;
 valid=false;response=await get();assert.equal(response.status,503);assert.equal((await response.text()).includes('PRIVATE'),false);valid=true;
 failed=true;response=await get();assert.equal(response.status,503);assert.equal((await response.text()).includes('PRIVATE'),false);
 assert.equal(module.exports.POST,undefined);
});
