const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('SKU reads require Lab and actor-scoped project/quote links; cached references survive read-permission failures',async()=>{
 let blocked=false,allowed=false,fail=false,token='',calls=0;const cached={quoteId:'123',lines:[]};const snapshot={hubspot:{dealId:'456',selectedQuoteId:'123',quotes:[{id:'123'}],skuReference:cached}};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Cache-Control':'private, no-store'}});
 const actorSupabase={from(table){return{select(){return this},eq(key,value){assert.equal(value,'job');return this},async maybeSingle(){return {data:table==='projects'?{hubspot_deal_id:'456'}:{snapshot},error:null}}}}};
 const imports={'@/lib/ada-server':{requireQuoteProductAccess:async()=>allowed?{ok:true,actorSupabase}:{ok:false,response:json({},401)}},'@/lib/quote-management-server':{labManagementGuard:()=>blocked?json({},403):null,managementJson:json},'@/lib/lab-quote-allocation':{validSkuReference:(r,id)=>r?.quoteId===id},'@/lib/lab-hubspot-skus':{readHubSpotSkus:async id=>{calls++;if(fail)throw Error('PRIVATE');return {quoteId:id,lines:[]};}}};
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/projects/[id]/quote-skus/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:n=>imports[n],URL,Promise,process:{env:{get LAB_HUBSPOT_READ_TOKEN(){return token;}}}});
 const get=(query='')=>module.exports.GET(new Request('https://lab/api/projects/job/quote-skus'+query),{params:Promise.resolve({id:'job'})});
 blocked=true;assert.equal((await get()).status,403);blocked=false;assert.equal((await get()).status,401);allowed=true;
 assert.equal((await get()).status,200);assert.equal(calls,0);token='fixture';fail=true;const fallback=await get('?refresh=1');assert.equal(fallback.status,200);assert.equal((await fallback.json()).reference.quoteId,'123');assert.equal(calls,1);
 snapshot.hubspot.selectedQuoteId='999';assert.equal((await get()).status,409);
 snapshot.hubspot.selectedQuoteId='123';snapshot.hubspot.dealId='other';assert.equal((await get()).status,409);assert.equal(calls,1);
});
