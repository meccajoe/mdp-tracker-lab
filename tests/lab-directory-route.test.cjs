const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('Lab directory is actor-scoped, paginates completely and selects one newest capture per project',async()=>{
 let blocked=false,authorized=false,sourceFailure=false,activityFailure=false,costFailure=false,empty=false;
 const reads=[];const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Cache-Control':'private, no-store'}});
 const sources=Array.from({length:201},(_,i)=>({project_id:String(i),projects:{id:String(i)}}));
 const captures=[{id:'new',project_id:'0',captured_at:'new'},{id:'old',project_id:'0',captured_at:'old'}];
 const actorSupabase={from(table){reads.push(table);return {select(){return this;},in(key,ids){assert.equal(key,table==='lab_project_costing_snapshots'?'activity_snapshot_id':'project_id');assert.ok(ids.length<=200);return this;},order(){return this;},async range(from,to){assert.equal(to-from,199);if(table==='lab_project_quote_sources')return sourceFailure&&from>0?{error:{message:'PRIVATE'}}:{data:empty?[]:sources.slice(from,to+1)};if(table==='lab_project_costing_snapshots')return costFailure?{error:{message:'PRIVATE'}}:{data:[{activity_snapshot_id:'new',evidence:'newest'},{activity_snapshot_id:'new',evidence:'older'}].slice(from,to+1)};return activityFailure?{error:{message:'PRIVATE'}}:{data:captures.slice(from,to+1)};}};}};
 const module={exports:{}};const imports={
 '@/lib/ada-server':{requireQuoteProductAccess:async()=>authorized?{ok:true,actorSupabase}:{ok:false,response:json({error:'auth'},401)}},
 '@/lib/quote-management-server':{labManagementGuard:()=>blocked?json({error:'lab'},403):null,managementJson:json},
 '@/lib/lab-project-directory':{directoryProject:(s,a,c)=>({id:s.project_id,capture:a?.captured_at??null,cost:c?.evidence??null})}
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/projects/lab-directory/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:name=>{assert.ok(imports[name]);return imports[name];},Map});
 blocked=true;assert.equal((await module.exports.GET()).status,403);assert.deepEqual(reads,[]);
 blocked=false;assert.equal((await module.exports.GET()).status,401);assert.deepEqual(reads,[]);
 authorized=true;let response=await module.exports.GET();assert.equal(response.status,200);let body=await response.json();assert.equal(body.projects.length,201);assert.equal(body.projects[0].capture,'new');assert.equal(body.projects[0].cost,'newest');assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 sourceFailure=true;response=await module.exports.GET();assert.equal(response.status,503);assert.equal((await response.text()).includes('PRIVATE'),false);sourceFailure=false;
 activityFailure=true;assert.equal((await module.exports.GET()).status,503);activityFailure=false;
 costFailure=true;assert.equal((await module.exports.GET()).status,503);costFailure=false;
 empty=true;assert.deepEqual(await(await module.exports.GET()).json(),{projects:[]});assert.equal(module.exports.POST,undefined);
});
