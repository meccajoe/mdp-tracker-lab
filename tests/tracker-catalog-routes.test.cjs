const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('catalog reads Tracker after initialization, imports only explicitly and enforces lab boundary',async()=>{
 let initialized=true,googleReads=0,allowed=true,rpcCalls=0,lastRpc,duplicate=null,writeError=null;
 const q=(data)=>({select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return this;},range(){return Promise.resolve({data,error:null});},maybeSingle(){return Promise.resolve({data,error:null});},then(resolve){return Promise.resolve({data,error:null}).then(resolve);}});
 const actor={ok:true,actorSupabase:{from:name=>q(name==='lab_material_catalog_import'?(initialized?{warnings:[]}:null):name==='quote_user_capabilities'?[{capability:'create_workspace'}]:[{item_id:'x',revision:1,name:'Panel',unit:'sheet',unit_cost:20,source:'Google Sheet DB'},{item_id:'deleted',revision:2,name:'Deleted panel',unit:'sheet',unit_cost:10,deleted_at:'2026-10-18'}]),rpc:async(name,args)=>{lastRpc={name,args};rpcCalls++;return {data:args.action==='edit'?{entry:{item_id:args.payload.itemId,revision:args.payload.expectedVersion+1,name:args.payload.name,unit:args.payload.unit,unit_cost:args.payload.unitCost,source:'Google Sheet DB'}}:{imported:1},error:writeError};}}};
 const imports={'@/lib/catalog-duplicates':{findCatalogDuplicate:()=>duplicate},'next/server':{NextResponse:Response},'@/lib/ada-server':{requireQuoteProductAccess:async()=>allowed?actor:{ok:false,response:Response.json({}, {status:403})}},'@/lib/quote-live-catalog':{fetchLiveCatalog:async()=>{googleReads++;return {materials:[],incomplete:[],warnings:[]};}},'@/lib/tracker-catalog':{catalogMaterial:r=>({...r,unitCost:r.unit_cost,deletedAt:r.deleted_at}),catalogInput:x=>{if(!x.name)throw Error('Missing name');return x;}}};
 const env={NEXT_PUBLIC_SUPABASE_URL:'https://gkvaeqlqrthztobxitvn.supabase.co'},module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/app/api/quotes/catalog/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>imports[n],process:{env},Response,Request});
 const route=module.exports;let result=await route.GET();assert.equal((await result.json()).materials.length,1);assert.equal(googleReads,0);
 const catalog=await (await route.GET()).json();assert.equal(catalog.entries.length,1);assert.equal(catalog.deletedEntries.length,1);
 for(const action of ['delete','restore']){const response=await route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({action,itemId:'11111111-1111-1111-1111-111111111111',expectedVersion:2})}));assert.equal(response.status,200);assert.equal(lastRpc.name,'lab_catalog_set_deleted');assert.equal(lastRpc.args.p_deleted,action==='delete');assert.equal(lastRpc.args.p_expected_revision,2);}
 const add=()=>route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({action:'add',name:'Panel',unit:'sheet',unitCost:25})}));
 rpcCalls=0;duplicate={name:'Equivalent panel',unit:'sheet',unitCost:30};let matched=await add();assert.equal(matched.status,200);assert.equal((await matched.json()).duplicate,true);assert.equal(rpcCalls,0);
 duplicate={...duplicate,itemId:'matched-id',revision:7,unitCost:10};matched=await add();const raised=await matched.json();assert.equal(raised.priceUpdated,true);assert.equal(raised.material.unitCost,25);assert.equal(lastRpc.args.action,'edit');assert.equal(lastRpc.args.payload.expectedVersion,7);assert.equal(lastRpc.args.payload.name,'Equivalent panel');assert.equal(lastRpc.args.payload.unit,'sheet');assert.equal(rpcCalls,1);
 writeError={code:'PT409'};assert.equal((await add()).status,409);assert.equal(rpcCalls,2);writeError=null;rpcCalls=0;
 duplicate={...duplicate,unitCost:25};matched=await add();assert.equal((await matched.json()).priceUpdated,false);assert.equal(rpcCalls,0);
 duplicate={...duplicate,unitCost:null};matched=await add();assert.equal((await matched.json()).priceUpdated,true);rpcCalls=0;
 duplicate={...duplicate,deletedAt:'2026-11-08'};assert.equal((await add()).status,409);assert.equal(rpcCalls,0);
 duplicate=null;assert.equal((await add()).status,200);assert.equal(rpcCalls,1);
 rpcCalls=0;initialized=false;await route.GET();assert.equal(googleReads,1);
 await route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({action:'import'})}));assert.equal(rpcCalls,1);assert.equal(googleReads,2);
 allowed=false;assert.equal((await route.GET()).status,403);assert.equal(googleReads,2);
 env.NEXT_PUBLIC_SUPABASE_URL='https://other.supabase.co';assert.equal((await route.GET()).status,403);
});
