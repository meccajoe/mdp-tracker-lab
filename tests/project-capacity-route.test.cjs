const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('project capacity enforces membership and reuses latest workbook permissions without exposing unrelated quotes',async()=>{
 let permitted=false,reads=0,requested;
 const query={select(){return this;},eq(_column,id){assert.equal(id,'00000000-0000-4000-8000-000000000001');return this;},async maybeSingle(){return {data:{title:'Project A',client_name:'Client A'}};}};
 const actor={ok:true,actorSupabase:{from:table=>{assert.equal(table,'ada_quote_workspaces');return query;}}};
 const imports={'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>permitted?actor:{ok:false,response:Response.json({error:'Denied'},{status:403})}},'../workbook/route':{GET:async request=>{reads++;requested=request.url;return Response.json({document:{saved:true},version:7,canEdit:false,history:['private unnecessary history']});}}};
 const source=ts.transpileModule(fs.readFileSync('src/app/api/quote-workspaces/[workspaceId]/capacity/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,require:name=>imports[name],Response,Request,URL});
 const context={params:Promise.resolve({workspaceId:'00000000-0000-4000-8000-000000000001'})};
 assert.equal((await module.exports.GET(new Request('https://lab.test?revision=1'),context)).status,403);assert.equal(reads,0);
 permitted=true;const response=await module.exports.GET(new Request('https://lab.test?revision=1'),context),data=await response.json();assert.equal(data.version,7);assert.equal(data.canEdit,false);assert.equal(data.workspace,'Project A');assert.equal(data.history,undefined);assert.equal(new URL(requested).search,'?activation=1');assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
