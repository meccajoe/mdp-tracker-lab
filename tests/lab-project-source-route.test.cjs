const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('project baseline reads require Lab, identity and actor RLS; failures never return partial data',async()=>{
 let blocked=false,authorized=false,source={workspace_id:'w',snapshot:{totals:{price:12}}},sourceError=null,project={id:'job'},projectError=null;
 const reads=[];
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Cache-Control':'private, no-store'}});
 const actorSupabase={from(table){reads.push(table);return {select(){return this;},eq(key,value){assert.equal(key,table==='lab_project_quote_sources'?'project_id':'id');assert.equal(value,'job');return this;},async maybeSingle(){return table==='lab_project_quote_sources'?{data:source,error:sourceError}:{data:project,error:projectError};}};}};
 const module={exports:{}};
 const imports={
  '@/lib/ada-server':{requireQuoteProductAccess:async()=>authorized?{ok:true,actorSupabase}:{ok:false,response:json({error:'auth'},401)}},
  '@/lib/quote-management-server':{labManagementGuard:()=>blocked?json({error:'lab'},403):null,managementJson:json}
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/projects/[id]/lab-source/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:name=>{assert.ok(imports[name]);return imports[name];}});
 const get=()=>module.exports.GET(new Request('https://lab/api/projects/job/lab-source'),{params:Promise.resolve({id:'job'})});
 blocked=true;assert.equal((await get()).status,403);assert.deepEqual(reads,[]);
 blocked=false;assert.equal((await get()).status,401);assert.deepEqual(reads,[]);
 authorized=true;source=null;assert.equal((await get()).status,404);assert.deepEqual(reads,['lab_project_quote_sources']);
 sourceError={message:'PRIVATE'};assert.equal((await get()).status,503);sourceError=null;
 source={workspace_id:'w',snapshot:{totals:{price:12}}};projectError={message:'PRIVATE'};const failed=await get();assert.equal(failed.status,503);assert.equal((await failed.text()).includes('PRIVATE'),false);
 projectError=null;const response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal((await response.json()).source.snapshot.totals.price,12);
 assert.equal(module.exports.POST,undefined);
});
