const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,imports){const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,require:name=>{if(!(name in imports))throw Error(name);return imports[name]},Response,Request,URL,TextEncoder});return module.exports;}
const json=(body,status=200)=>Response.json(body,{status});
const management={labManagementGuard:()=>null,managementJson:json,missingManagement:code=>code==='PGRST205',managementError:error=>json({error:error.message},error.code==='PT409'?409:503)};
function query(data,error=null){const q={then:resolve=>Promise.resolve({data,error}).then(resolve)};for(const name of ['select','eq','in','is','order','limit','insert'])q[name]=()=>q;q.single=q.maybeSingle=()=>Promise.resolve({data,error});return q;}
const id='00000000-0000-4000-8000-000000000001';
test('create requires both names, freezes defaults through atomic RPC, and passes a stable request identity',async()=>{
 const calls=[];const actor={ok:true,actorSupabase:{from:()=>query({revision:3,document:{settings:{laborSell:125}}}),rpc:(name,args)=>{calls.push({name,args});return query({id});}}};
 const imports={'next/server':{NextRequest:Request},'@/app/api/ada/workspaces/route':{GET(){throw Error('unexpected')},POST(){throw Error('unexpected fallback')}},'@/lib/ada-server':{requireQuoteProductAccess:async()=>actor},'@/lib/quote-v27-template':{createBlankQuoteV27:()=>({blank:true})},'@/lib/quote-defaults':{requiredQuoteNames:b=>{if(!b.title||!b.clientName)throw Error('Both names required');return {title:b.title,clientName:b.clientName}},quoteFromDefaults:d=>({copied:d})},'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-management-server':management};
 const route=load('src/app/api/quote-workspaces/route.ts',imports),post=body=>route.POST(new Request('https://lab.test/api/quote-workspaces',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await post({title:'Project'})).status,400);assert.equal(calls.length,0);
 assert.equal((await post({title:'Project',clientName:'Client',requestId:id})).status,201);assert.equal(calls[0].name,'create_lab_quote');assert.equal(calls[0].args.p_defaults_revision,3);assert.equal(calls[0].args.p_request_id,id);assert.equal(calls[0].args.p_document.copied.settings.laborSell,125);
 await post({title:'Import',clientName:'Client',requestId:id,initialDocument:{originalPricing:true}});assert.equal(calls[1].args.p_defaults_revision,null);assert.equal(calls[1].args.p_document.originalPricing,true);
});
test('Draft/Final requires workspace edit authorization and expected status and workbook versions',async()=>{
 let permitted=false,calls=[];const actor={ok:true,actorSupabase:{rpc:(name,args)=>{calls.push(args);return query({quote_status:'final',version:5})}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/status/route.ts',{'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async(_id,action)=>{assert.equal(action,'edit_draft');return permitted?actor:{ok:false,response:json({error:'Forbidden'},403)}}},'@/lib/quote-permissions':{},'@/lib/quote-management-server':management});
 const post=b=>route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify(b)}),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await post({status:'final',expectedVersion:4,expectedRevision:10})).status,403);assert.equal(calls.length,0);permitted=true;
 assert.equal((await post({status:'accepted',expectedVersion:4,expectedRevision:10})).status,400);
 assert.equal((await post({status:'final',expectedVersion:4,expectedRevision:10})).status,200);assert.equal(calls[0].p_expected_version,4);assert.equal(calls[0].p_expected_revision,10);
});
test('clone requires source access, uses latest saved source, and preserves its pricing instead of globals',async()=>{
 let permitted=false,calls=[];const actor={ok:true,actorSupabase:{from:t=>query(t==='ada_quote_workspaces'?{title:'Original',client_name:'Client',contact_name:null}:{revision:8,document:{priceOverride:123}}),rpc:(name,args)=>{calls.push(args);return query({id})}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/clone/route.ts',{'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>permitted?actor:{ok:false,response:json({},403)}},'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-defaults':{cloneQuoteDocument:(d,copy)=>({...d,copy}),requiredQuoteNames:x=>x},'@/lib/quote-management-server':management});
 const post=()=>route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({requestId:id})}),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await post()).status,403);assert.equal(calls.length,0);permitted=true;assert.equal((await post()).status,201);assert.equal(calls[0].p_title,'Original CLONE');assert.equal(calls[0].p_source_revision,8);assert.equal(calls[0].p_defaults_revision,null);assert.equal(calls[0].p_document.priceOverride,123);assert.equal(calls[0].p_document.copy,false);
});
