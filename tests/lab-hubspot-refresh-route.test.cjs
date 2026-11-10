const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('manual HubSpot refresh requires Lab admin and workspace access, then reads bound identity before one server RPC',async()=>{
 let blocked=false,authorized=false,role='viewer',source=null,sourceError=null,deal='123',providerFailure=false,rpcFailure=false;
 const reads=[],provider=[],writes=[],env={};const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
 const actorSupabase={from(table){reads.push(table);return {select(){return this},eq(){return this},async maybeSingle(){return table==='lab_project_quote_sources'?{data:source,error:sourceError}:{data:{hubspot_deal_id:deal}}}}}};
 const access={actorSupabase,supabase:{async rpc(name,args){writes.push({name,args});return rpcFailure?{error:{message:'PRIVATE'}}:{data:{name:'Exact'}}}}};
 const imports={
  '@/lib/ada-server':{requireQuoteProductAccess:async()=>authorized?{...access,ok:true,actorRole:role}:{ok:false,response:json({},401)}},
  '@/lib/quote-management-server':{labManagementGuard:()=>blocked?json({},403):null,managementJson:json},
  '@/lib/hubspot-project-identity':{readHubSpotProjectIdentity:async(id,token)=>{provider.push({id,token});if(providerFailure)throw Error('PRIVATE');return {dealId:id,name:'Exact',jobNumber:'26223'}}}
 };
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/projects/[id]/refresh-hubspot/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:n=>imports[n],process:{env}});
 const post=()=>module.exports.POST(new Request('https://lab/api/projects/job/refresh-hubspot',{method:'POST',body:'{"dealId":"attacker"}'}),{params:Promise.resolve({id:'job'})});
 blocked=true;assert.equal((await post()).status,403);blocked=false;assert.equal((await post()).status,401);
 authorized=true;assert.equal((await post()).status,403);assert.equal(reads.length,0);
 role='admin';assert.equal((await post()).status,404);assert.equal(provider.length,0);
 source={workspace_id:'w'};sourceError={message:'PRIVATE'};assert.equal((await post()).status,503);sourceError=null;
 deal=null;assert.equal((await post()).status,409);deal='123';assert.equal((await post()).status,503);assert.equal(writes.length,0);
 env.LAB_HUBSPOT_READ_TOKEN='private-fixture';providerFailure=true;const failed=await post();assert.equal(failed.status,502);assert.equal((await failed.text()).includes('PRIVATE'),false);assert.equal(writes.length,0);
 providerFailure=false;assert.equal((await post()).status,200);assert.deepEqual(provider.at(-1),{id:'123',token:'private-fixture'});
 assert.equal(writes[0].name,'apply_lab_hubspot_identity');assert.deepEqual({...writes[0].args},{p_project_id:'job',p_deal_id:'123',p_name:'Exact',p_job_number:'26223'});
 rpcFailure=true;assert.equal((await post()).status,409);assert.equal(module.exports.GET,undefined);
});
