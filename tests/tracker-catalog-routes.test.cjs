const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('catalog reads Tracker after initialization, imports only explicitly and enforces lab boundary',async()=>{
 let initialized=true,googleReads=0,allowed=true,rpcCalls=0,lastRpc;
 const q=(data)=>({select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return this;},range(){return Promise.resolve({data,error:null});},maybeSingle(){return Promise.resolve({data,error:null});},then(resolve){return Promise.resolve({data,error:null}).then(resolve);}});
 const actor={ok:true,actorSupabase:{from:name=>q(name==='lab_material_catalog_import'?(initialized?{warnings:[]}:null):name==='quote_user_capabilities'?[{capability:'create_workspace'}]:[{item_id:'x',revision:1,name:'Panel',unit:'sheet',unit_cost:20,source:'Google Sheet DB'},{item_id:'deleted',revision:2,name:'Deleted panel',unit:'sheet',unit_cost:10,deleted_at:'2026-10-18'}]),rpc:async(name,args)=>{lastRpc={name,args};rpcCalls++;return {data:{imported:1},error:null};}}};
 const imports={'next/server':{NextResponse:Response},'@/lib/ada-server':{requireQuoteProductAccess:async()=>allowed?actor:{ok:false,response:Response.json({}, {status:403})}},'@/lib/quote-live-catalog':{fetchLiveCatalog:async()=>{googleReads++;return {materials:[],incomplete:[],warnings:[]};}},'@/lib/tracker-catalog':{catalogMaterial:r=>({...r,unitCost:r.unit_cost,deletedAt:r.deleted_at}),catalogInput:x=>{if(!x.name)throw Error('Missing name');return x;}}};
 const env={NEXT_PUBLIC_SUPABASE_URL:'https://gkvaeqlqrthztobxitvn.supabase.co'},module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/app/api/quotes/catalog/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>imports[n],process:{env},Response,Request});
 const route=module.exports;let result=await route.GET();assert.equal((await result.json()).materials.length,1);assert.equal(googleReads,0);
 const catalog=await (await route.GET()).json();assert.equal(catalog.entries.length,1);assert.equal(catalog.deletedEntries.length,1);
 for(const action of ['delete','restore']){const response=await route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({action,itemId:'11111111-1111-1111-1111-111111111111',expectedVersion:2})}));assert.equal(response.status,200);assert.equal(lastRpc.name,'lab_catalog_set_deleted');assert.equal(lastRpc.args.p_deleted,action==='delete');assert.equal(lastRpc.args.p_expected_revision,2);}
 rpcCalls=0;initialized=false;await route.GET();assert.equal(googleReads,1);
 await route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({action:'import'})}));assert.equal(rpcCalls,1);assert.equal(googleReads,2);
 allowed=false;assert.equal((await route.GET()).status,403);assert.equal(googleReads,2);
 env.NEXT_PUBLIC_SUPABASE_URL='https://other.supabase.co';assert.equal((await route.GET()).status,403);
});
