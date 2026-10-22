const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,imports){const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;if(path!=='src/lib/quote-schedule.ts')imports['@/lib/quote-schedule']??=load('src/lib/quote-schedule.ts',{});imports['@/lib/workback-server']??={persistWorkback:async()=>({changed:false})};const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,require:name=>{if(!(name in imports))throw Error(name);return imports[name]},Response,Request,URL,TextEncoder,Buffer,Uint8Array,structuredClone});return module.exports;}
const json=(body,status=200)=>Response.json(body,{status});
const management={labManagementGuard:()=>null,managementJson:json,missingManagement:code=>code==='PGRST205',managementError:error=>json({error:error.message},error.code==='PT409'?409:503)};
function query(data,error=null){const q={then:resolve=>Promise.resolve({data,error}).then(resolve)};for(const name of ['select','eq','in','is','order','limit','insert'])q[name]=()=>q;q.single=q.maybeSingle=()=>Promise.resolve({data,error});return q;}
const id='00000000-0000-4000-8000-000000000001';
test('create requires both names, freezes defaults through atomic RPC, and passes a stable request identity',async()=>{
 const calls=[];const actor={ok:true,actorSupabase:{from:()=>query({revision:3,document:{settings:{laborSell:125}}}),rpc:(name,args)=>{calls.push({name,args});return query({id});}}};
 const imports={'@/lib/quote-v27':{calculateQuoteV27:()=>({totals:{price:0}})},'next/server':{NextRequest:Request},'@/app/api/ada/workspaces/route':{GET(){throw Error('unexpected')},POST(){throw Error('unexpected fallback')}},'@/lib/ada-server':{requireQuoteProductAccess:async()=>actor},'@/lib/quote-v27-template':{createBlankQuoteV27:()=>({blank:true})},'@/lib/quote-defaults':{requiredQuoteNames:b=>{if(!b.title||!b.clientName)throw Error('Both names required');return {title:b.title,clientName:b.clientName}},quoteFromDefaults:d=>({copied:d})},'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-management-server':management};
 const route=load('src/app/api/quote-workspaces/route.ts',imports),post=body=>route.POST(new Request('https://lab.test/api/quote-workspaces',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await post({title:'Project'})).status,400);assert.equal(calls.length,0);
 assert.equal((await post({title:'Project',clientName:'Client',requestId:id})).status,201);assert.equal(calls[0].name,'create_lab_quote');assert.equal(calls[0].args.p_defaults_revision,3);assert.equal(calls[0].args.p_request_id,id);assert.equal(calls[0].args.p_document.copied.settings.laborSell,125);
 await post({title:'Import',clientName:'Client',requestId:id,initialDocument:{originalPricing:true}});assert.equal(calls[1].args.p_defaults_revision,null);assert.equal(calls[1].args.p_document.originalPricing,true);
});
test('Draft/Final requires workspace edit authorization and expected status and workbook versions',async()=>{
 let permitted=false,calls=[];const actor={ok:true,actorSupabase:{from:t=>query(t==='ada_quote_workspaces'?{title:'Project',client_name:'Client'}:{revision:10,document:{}}),rpc:(name,args)=>{calls.push({...args,rpcName:name});return query({quote_status:'final',version:5})}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/status/route.ts',{'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-cad-turnover':{buildCadTurnover:()=>({})},'@/lib/quote-cad-pdf':{renderCadTurnoverPdf:async()=>Buffer.from('%PDF-test')},'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async(_id,action)=>{assert.equal(action,'edit_draft');return permitted?actor:{ok:false,response:json({error:'Forbidden'},403)}}},'@/lib/quote-permissions':{},'@/lib/quote-management-server':management});
 const post=b=>route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify(b)}),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await post({status:'final',expectedVersion:4,expectedRevision:10})).status,403);assert.equal(calls.length,0);permitted=true;
 assert.equal((await post({status:'accepted',expectedVersion:4,expectedRevision:10})).status,400);
 assert.equal((await post({status:'final',expectedVersion:4,expectedRevision:10})).status,200);assert.equal(calls[0].p_expected_version,4);assert.equal(calls[0].p_expected_revision,10);assert.equal(calls[0].rpcName,'finalize_lab_quote_with_cad');assert.equal(Buffer.from(calls[0].p_pdf_base64,'base64').toString(),'%PDF-test');
});
test('clone requires source access, uses latest saved source, and preserves its pricing instead of globals',async()=>{
 let permitted=false,calls=[];const actor={ok:true,actorSupabase:{from:t=>query(t==='ada_quote_workspaces'?{title:'Original',client_name:'Client',contact_name:null}:{revision:8,document:{priceOverride:123}}),rpc:(name,args)=>{calls.push(args);return query({id})}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/clone/route.ts',{'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-cad-turnover':{buildCadTurnover:(_q,meta)=>meta},'@/lib/quote-cad-pdf':{renderCadTurnoverPdf:async()=>Buffer.from('%PDF-generated')},'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>permitted?actor:{ok:false,response:json({},403)}},'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-defaults':{cloneQuoteDocument:(d,copy)=>({...d,copy}),requiredQuoteNames:x=>{if(typeof x.title!=='string'||!x.title.trim())throw Error('Project Name is required');return {...x,title:x.title.trim()}}},'@/lib/quote-management-server':management});
 const post=(extra={})=>route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({requestId:id,...extra})}),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await post()).status,403);assert.equal(calls.length,0);permitted=true;assert.equal((await post()).status,201);assert.equal(calls[0].p_title,'Original CLONE');assert.equal(calls[0].p_source_revision,8);assert.equal(calls[0].p_defaults_revision,null);assert.equal(calls[0].p_document.priceOverride,123);assert.equal(calls[0].p_document.copy,false);
 assert.equal((await post({title:'  Custom project  '})).status,201);assert.equal(calls[1].p_title,'Custom project');assert.equal(calls[1].p_document.priceOverride,123);
 assert.equal((await post({title:' '})).status,400);assert.equal(calls.length,2);

});
test('CAD generation failure leaves Final unset, and stale finalization reports a conflict',async()=>{
 let renderFails=true,calls=0;
 const actor={ok:true,actorSupabase:{from:t=>query(t==='ada_quote_workspaces'?{title:'Project',client_name:'Client'}:{revision:10,document:{}}),rpc:()=>{calls++;return query(null,{code:'PT409',message:'Stale quote'});}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/status/route.ts',{'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-cad-turnover':{buildCadTurnover:()=>({})},'@/lib/quote-cad-pdf':{renderCadTurnoverPdf:async()=>{if(renderFails)throw Error('render failed');return Buffer.from('%PDF-test')}},'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>actor},'@/lib/quote-permissions':{},'@/lib/quote-management-server':management});
 const post=()=>route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({status:'final',expectedVersion:4,expectedRevision:10})}),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await post()).status,422);assert.equal(calls,0);renderFails=false;assert.equal((await post()).status,409);assert.equal(calls,1);
});
test('CAD download enforces membership, current Final version and renders the pinned finalized revision without rewriting its PDF',async()=>{
 let permitted=false,status='final',version=2;
 const filters=[];const actor={ok:true,actorSupabase:{from:t=>{const q=query(t==='lab_quote_controls'?{quote_status:status,version}:t==='quote_workbook_revisions'?{document:{},revision:8}:t==='ada_quote_workspaces'?{title:'Renamed',client_name:'Client'}:{project_name:'Golden Arch',workbook_revision:8});q.eq=(key,value)=>{filters.push([t,key,value]);return q;};return q;}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/cad-turnover/route.ts',{'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-cad-turnover':{buildCadTurnover:(_q,meta)=>meta},'@/lib/quote-cad-pdf':{renderCadTurnoverPdf:async()=>Buffer.from('%PDF-generated')},'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>permitted?actor:{ok:false,response:json({},403)}},'@/lib/quote-management-server':management});
 const get=(v=2)=>route.GET(new Request('https://lab.test?version='+v),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await get()).status,403);permitted=true;assert.equal((await get(1)).status,409);
 status='draft';assert.equal((await get()).status,409);status='final';
 const response=await get();assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.match(response.headers.get('Content-Disposition'),/Golden-Arch-CAD-Turnover-r8.pdf/);assert.equal(await response.text(),'%PDF-generated');
 assert.ok(filters.some(([table,key,value])=>table==='quote_workbook_revisions'&&key==='revision'&&value===8));

});
test('older Final quotes render CAD without writes and reject concurrent status changes',async()=>{
 let controlsReads=0,changed=false;
 const actor={ok:true,actorSupabase:{from:t=>{
  if(t==='lab_quote_controls'){controlsReads++;return query({quote_status:changed&&controlsReads>1?'draft':'final',version:2});}
  if(t==='lab_cad_turnovers')return query(null);
  if(t==='ada_quote_workspaces')return query({title:'Older Final',client_name:'Client'});
  if(t==='quote_workbook_revisions')return query({revision:8,document:{}});
  throw Error('Unexpected table');
 },rpc:()=>{throw Error('Download must not write');}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/cad-turnover/route.ts',{'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-cad-turnover':{buildCadTurnover:(_q,meta)=>meta},'@/lib/quote-cad-pdf':{renderCadTurnoverPdf:async()=>Buffer.from('%PDF-generated')},'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>actor},'@/lib/quote-management-server':management});
 const get=()=>route.GET(new Request('https://lab.test?version=2'),{params:Promise.resolve({workspaceId:id})});
 assert.equal(await (await get()).text(),'%PDF-generated');
 controlsReads=0;changed=true;assert.equal((await get()).status,409);
});
test('Final generates workback first and fails visibly if schedule persistence fails',async()=>{
 let schedules=0,finals=0,fail=true;
 const actor={ok:true,actorId:'actor',actorEmail:'actor',actorSupabase:{from:t=>query(t==='ada_quote_workspaces'?{title:'Project',client_name:'Client'}:{revision:10,document:{}}),rpc:()=>{finals++;return query({quote_status:'final',version:1})}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/status/route.ts',{'@/lib/workback-server':{persistWorkback:async(...args)=>{assert.equal(args[4].force,true);schedules++;if(fail)throw Error('Schedule storage unavailable')}},'@/lib/quote-v27-validation':{parseQuoteV27:d=>d},'@/lib/quote-cad-turnover':{buildCadTurnover:()=>({})},'@/lib/quote-cad-pdf':{renderCadTurnoverPdf:async()=>Buffer.from('%PDF-test')},'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>actor},'@/lib/quote-permissions':{},'@/lib/quote-management-server':management});
 const post=()=>route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({status:'final',expectedVersion:0,expectedRevision:10})}),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await post()).status,409);assert.equal(finals,0);fail=false;assert.equal((await post()).status,200);assert.equal(schedules,2);assert.equal(finals,1);
});
test('forecast saves only status metadata, rejects stale input and preserves prices and remaining hours',async()=>{
 const original={settings:{laborSell:110},lines:[{price:1234}],schedule:{buildStart:'2026-10-01',buildFinish:'2026-10-30',installDate:'',status:'Possible'},planning:{status:'Lost',remainingShop:18,remainingTrades:{Painting:8},notes:'Keep'}};
 let inserted,allowed=true,archived=false;
 const actor={ok:true,get workspaceLifecycle(){return archived?'archived':'draft'},actorId:id,actorEmail:'test@example.test',actorSupabase:{from(){const q=query({document:original,revision:4,engine_version:'v27-1'});q.insert=value=>{inserted=value;return query({revision:5});};return q;}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/forecast/route.ts',{'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async(_id,action)=>{assert.equal(action,'edit_draft');return allowed?actor:{ok:false,response:json({},403)};}},'@/lib/quote-management-server':management,'@/lib/quote-schedule':load('src/lib/quote-schedule.ts',{'@/lib/quote-schedule':{}}),'@/lib/workback-server':{persistWorkback:async()=>{} }});
 const post=(status='Likely',expectedVersion=4)=>route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({status,expectedVersion})}),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await post('wrong')).status,400);assert.equal((await post('Likely',3)).status,409);assert.equal(inserted,undefined);
 assert.equal((await post()).status,200);assert.equal(inserted.document.schedule.status,'Likely');assert.equal(inserted.document.planning.status,'');assert.equal(original.planning.status,'Lost');assert.equal(inserted.document.planning.remainingShop,18);assert.deepEqual(inserted.document.lines,original.lines);assert.deepEqual(inserted.document.settings,original.settings);
 const projectSave=await route.POST(new Request('https://lab.test',{method:'POST',body:JSON.stringify({projectStatus:'Complete',expectedVersion:4})}),{params:Promise.resolve({workspaceId:id})});
 assert.equal(projectSave.status,200);assert.equal(inserted.document.schedule.projectStatus,'Complete');assert.deepEqual(inserted.document.lines,original.lines);
 archived=true;assert.equal((await post()).status,403);archived=false;allowed=false;assert.equal((await post()).status,403);
});
test('client edit requires access, rejects blank/stale names and preserves other metadata',async()=>{
 let permitted=false,calls=[];
 const actor={ok:true,actorEmail:'paul@example.com',actorSupabase:{from:()=>query({title:'Project',client_name:'Old client',contact_name:'Contact',ada_project_id:'linked-project'}),rpc:(name,args)=>{calls.push(args);return query({client_name:args.p_client_name});}}};
 const route=load('src/app/api/quote-workspaces/[workspaceId]/client/route.ts',{'@/lib/ada-server':{requireQuoteProductWorkspaceAccess:async()=>permitted?actor:{ok:false,response:json({},403)}}});
 const patch=(clientName,expectedClientName='Old client')=>route.PATCH(new Request('https://lab.test',{method:'PATCH',body:JSON.stringify({clientName,expectedClientName})}),{params:Promise.resolve({workspaceId:id})});
 assert.equal((await patch('New')).status,403);permitted=true;assert.equal((await patch('')).status,400);assert.equal((await patch('New','Other')).status,409);assert.equal(calls.length,0);
 assert.equal((await patch('New')).status,200);assert.equal(calls[0].p_title,'Project');assert.equal(calls[0].p_contact_name,'Contact');assert.equal(calls[0].p_ada_project_id,'linked-project');assert.equal(calls[0].p_client_name,'New');
});

test('quote list totals use latest saved pricing and omit documents; missing or invalid workbooks have no amount',async()=>{
 const workspaces=[{id:'saved'},{id:'missing'},{id:'invalid'}],seen=[];
 const actor={ok:true,actorSupabase:{from:table=>query(table==='lab_quote_controls'?[]:[{id:'saved',quote_workbook_revisions:[{revision:4,document:{savedPrice:1234.56}}]},{id:'invalid',quote_workbook_revisions:[{revision:1,document:{invalid:true}}]}])}};
 const route=load('src/app/api/quote-workspaces/route.ts',{'next/server':{NextRequest:Request},'@/app/api/ada/workspaces/route':{GET:async()=>json({workspaces})},'@/lib/ada-server':{requireQuoteProductAccess:async()=>actor},'@/lib/quote-v27-template':{},'@/lib/quote-defaults':{},'@/lib/quote-v27-validation':{parseQuoteV27:d=>{if(d.invalid)throw Error('invalid');return d}},'@/lib/quote-v27':{calculateQuoteV27:d=>{seen.push(d);return {totals:{price:d.savedPrice}}}},'@/lib/quote-management-server':management});
 const response=await route.GET(new Request('https://lab.test')),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.workspaces[0].quote_total,1234.56);assert.equal(body.workspaces[0].workbook_revision,4);
 assert.equal(body.workspaces[1].quote_total,null);assert.equal(body.workspaces[2].quote_total,null);assert.equal(seen.length,1);assert.equal(JSON.stringify(body).includes('savedPrice'),false);
});
