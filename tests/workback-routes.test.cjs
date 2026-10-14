const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('workback endpoints enforce membership, edit authorization, revision checks and lab guard',async()=>{
 let permitted=false,blocked=false,persisted=0;
 const actor={ok:true,actorSupabase:{},actorId:'actor',actorEmail:'actor',quoteActor:{},workspaceLifecycle:'active'};
 const imports={'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async(_id,action)=>{if(action)assert.equal(action,'edit_draft');return permitted?actor:{ok:false,response:Response.json({}, {status:403})};}},'@/lib/quote-permissions':{canPerformQuoteAction:()=>true},'@/lib/quote-management-server':{labManagementGuard:()=>blocked?Response.json({}, {status:403}):null,managementJson:(b,status=200)=>Response.json(b,{status})},'@/lib/workback-server':{persistWorkback:async(_db,_id,_actor,_email,options)=>{persisted++;assert.equal(options.force,true);if(options.expectedVersion!==3)throw Error('Schedule changed on another device');return {version:4};}},'@/lib/workback':{},'@/lib/workback-pdf':{}};
 const source=ts.transpileModule(fs.readFileSync('src/app/api/quote-workspaces/[workspaceId]/workback/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,require:n=>imports[n],Response,Request,TextEncoder,URL,Error});
 const context={params:Promise.resolve({workspaceId:'test'})},post=(body)=>module.exports.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify(body)}),context);
 assert.equal((await post({expectedVersion:3,action:'generate'})).status,403);assert.equal(persisted,0);permitted=true;
 assert.equal((await post({expectedVersion:-1,action:'approve'})).status,400);assert.equal(persisted,0);
 assert.equal((await post({expectedVersion:2,action:'save'})).status,409);
 assert.equal((await post({expectedVersion:3,action:'generate'})).status,200);
 blocked=true;assert.equal((await post({expectedVersion:3,action:'generate'})).status,403);assert.equal(persisted,2);
});
