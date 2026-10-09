const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const next={NextResponse:{json:(body,options)=>Response.json(body,options)}};
function load(path,imports){
  const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,require:name=>{if(!(name in imports))throw new Error(name);return imports[name];},URL,Response,TextEncoder,Map});return module.exports;
}
const id='11111111-1111-4111-8111-111111111111';
const policy=load('src/lib/quote-permissions.ts',{});
function fixture({role='owner',revision=4,rows,memberError=false,workspaceError=false,ok=true}={}){
  const calls=[];
  const membershipRows=[{workspace_id:id,workspace_role:role}];
  const workspaceRows=rows??[{id,title:'Synthetic',status:'draft',lifecycle_status:'draft',archived_at:null,quote_workbook_revisions:[{revision}]}];
  function client(actor){return {from(table){
    const entry={actor,table,operations:[]};calls.push(entry);
    const result={data:table==='quote_workspace_members'?membershipRows:workspaceRows,error:(table==='quote_workspace_members'?memberError:workspaceError)?{message:'Fail'}:null};
    const query={then(resolve){return Promise.resolve(result).then(resolve);}};
    for(const name of ['select','eq','is','order','range','in','neq','limit','gt'])query[name]=(...args)=>{entry.operations.push([name,...args]);return query;};
    return query;
  }}};
  const access={ok,actorId:'joe',actorEmail:'joe@lab.test',actorRole:null,supabase:client(false),actorSupabase:client(true),response:Response.json({error:'Forbidden'},{status:403})};
  const route=load('src/app/api/quote-workspaces/manifest/route.ts',{'next/server':next,'@/lib/ada-server':{requireQuoteProductAccess:async()=>access},'@/lib/quote-permissions':policy});
  return {calls,get:url=>route.GET(new Request('https://lab.test'+(url??'/api/quote-workspaces/manifest')))};
}
test('manifest uses verified actor RLS for bounded latest revisions, exact membership and private no-store',async()=>{
  const f=fixture(),response=await f.get(),body=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(body.actorKey,'joe:joe@lab.test');assert.equal(body.workspaces[0].revision,4);assert.equal(body.workspaces[0].canEdit,true);
  const membership=f.calls.find(x=>x.table==='quote_workspace_members');assert.ok(membership.operations.some(x=>x[0]==='eq'&&x[1]==='user_id'&&x[2]==='joe'));assert.ok(membership.operations.some(x=>x[0]==='eq'&&x[1]==='email_normalized'&&x[2]==='joe@lab.test'));assert.ok(membership.operations.some(x=>x[0]==='is'&&x[1]==='removed_at'&&x[2]===null));
  const workspaces=f.calls.find(x=>x.table==='ada_quote_workspaces');assert.equal(workspaces.actor,true);assert.ok(!workspaces.operations[0][1].includes('document'));assert.ok(workspaces.operations.some(x=>x[0]==='limit'&&x[1]===101));assert.ok(workspaces.operations.some(x=>x[0]==='limit'&&x[1]===1&&x[2].referencedTable==='quote_workbook_revisions'));assert.ok(workspaces.operations.some(x=>x[0]==='neq'&&x[1]==='lifecycle_status'&&x[2]==='archived'));
});
test('viewer, no workbook, authorization and query errors fail without privilege expansion',async()=>{
  const viewer=await(await fixture({role:'viewer',revision:0}).get()).json();assert.equal(viewer.workspaces[0].canEdit,false);assert.equal(viewer.workspaces[0].revision,0);
  assert.equal((await fixture({ok:false}).get()).status,403);assert.equal((await fixture({memberError:true}).get()).status,500);assert.equal((await fixture({workspaceError:true}).get()).status,500);assert.equal((await fixture().get('/api/quote-workspaces/manifest?cursor=invalid')).status,400);
});
test('manifest returns 100 rows and keyset cursor, and reads strictly after it',async()=>{
  const rows=Array.from({length:101},(_,i)=>({id:i===99?id:String(i),title:'Fixture',lifecycle_status:'draft',quote_workbook_revisions:[]}));
  const f=fixture({rows}),body=await(await f.get()).json();assert.equal(body.workspaces.length,100);assert.equal(body.nextCursor,id);
  const nextPage=fixture();await nextPage.get('/api/quote-workspaces/manifest?cursor='+id);assert.ok(nextPage.calls.find(x=>x.table==='ada_quote_workspaces').operations.some(x=>x[0]==='gt'&&x[1]==='id'&&x[2]===id));
});
test('saved workbook GET validates once without redundant calculation; POST retains calculation and expectedVersion',async()=>{
  let parsed=0,calculated=0,inserted;
  const query={select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:[{revision:2}],error:null})},maybeSingle(){return Promise.resolve({data:{revision:2,document:{fixture:true}},error:null})},insert(value){inserted=value;return this},single(){return Promise.resolve({data:{revision:3,created_at:'now'},error:null})}};
  const route=load('src/app/api/quote-workspaces/[workspaceId]/workbook/route.ts',{'next/server':next,'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>({ok:true,workspaceLifecycle:'draft',quoteActor:{email:'joe',workspaceRole:'owner',isActiveMember:true,capabilities:[]},actorId:'joe',actorEmail:'joe',actorSupabase:{from:()=>query}})},'@/lib/quote-permissions':policy,'@/lib/quote-v27':{calculateQuoteV27:()=>{calculated++;return {price:1};}},'@/lib/quote-v27-validation':{parseQuoteV27:d=>{parsed++;return d;}},'@/lib/quote-v27-template':{createBlankQuoteV27:()=>({})},'@/data/quote-v27-fonroche.json':{}});
  const context={params:Promise.resolve({workspaceId:id})};const get=await(await route.GET(new Request('https://lab.test'),context)).json();assert.equal(parsed,1);assert.equal(calculated,0);assert.equal('calculation' in get,false);
  const post=await route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({expectedVersion:2,document:{fixture:true}})}),context);assert.equal(post.status,201);assert.equal(calculated,1);assert.equal(inserted.revision,3);assert.equal((await post.json()).calculation.price,1);
});
