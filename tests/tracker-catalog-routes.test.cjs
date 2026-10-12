const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('catalog reads Tracker after initialization, imports only explicitly and enforces lab boundary',async()=>{
 let initialized=true,googleReads=0,allowed=true,rpcCalls=0;
 const q=(data)=>({select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return this;},range(){return Promise.resolve({data,error:null});},maybeSingle(){return Promise.resolve({data,error:null});},then(resolve){return Promise.resolve({data,error:null}).then(resolve);}});
 const actor={ok:true,actorSupabase:{from:name=>q(name==='lab_material_catalog_import'?(initialized?{warnings:[]}:null):name==='quote_user_capabilities'?[{capability:'create_workspace'}]:[{item_id:'x',revision:1,name:'Panel',unit:'sheet',unit_cost:20,source:'Google Sheet DB'}]),rpc:async()=>{rpcCalls++;return {data:{imported:1},error:null};}}};
 const imports={'next/server':{NextResponse:Response},'@/lib/ada-server':{requireQuoteProductAccess:async()=>allowed?actor:{ok:false,response:Response.json({}, {status:403})}},'@/lib/quote-live-catalog':{fetchLiveCatalog:async()=>{googleReads++;return {materials:[],incomplete:[],warnings:[]};}},'@/lib/tracker-catalog':{catalogMaterial:r=>({...r,unitCost:r.unit_cost}),catalogInput:x=>{if(!x.name)throw Error('Missing name');return x;}}};
 const env={NEXT_PUBLIC_SUPABASE_URL:'https://gkvaeqlqrthztobxitvn.supabase.co'},module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/app/api/quotes/catalog/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>imports[n],process:{env},Response,Request});
 const route=module.exports;let result=await route.GET();assert.equal((await result.json()).materials.length,1);assert.equal(googleReads,0);
 initialized=false;await route.GET();assert.equal(googleReads,1);
 await route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({action:'import'})}));assert.equal(rpcCalls,1);assert.equal(googleReads,2);
 allowed=false;assert.equal((await route.GET()).status,403);assert.equal(googleReads,2);
 env.NEXT_PUBLIC_SUPABASE_URL='https://other.supabase.co';assert.equal((await route.GET()).status,403);
});
