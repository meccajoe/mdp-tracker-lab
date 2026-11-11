const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('Find item source control filters the stored rows and requires Lab identity',async()=>{
 let authorized=false,blocked=false,reads=0;
 const rows=[{id:'one',source:'hubspot',hubspot_deal_id:'456'},{id:'two',source:'qbo'}];
 const db={from(table){assert.equal(table,'quote_line_items');reads++;let source=null;const query={select(){return query},order(){return query},range(){return query},eq(key,value){assert.equal(key,'source');source=value;return query},then(fn){const data=rows.filter(row=>!source||row.source===source);return Promise.resolve({data,count:data.length,error:null}).then(fn)}};return query;}};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
 const module={exports:{}};const imports={
 'next/server':{NextResponse:{json:(body,options)=>json(body,options?.status??200)}},
 '@supabase/supabase-js':{createClient:()=>db},
 '@/lib/ada-server':{requireQuoteProductAccess:async()=>authorized?{ok:true}:{ok:false,response:json({error:'auth'},401)}},
 '@/lib/quote-management-server':{labManagementGuard:()=>blocked?json({error:'lab'},403):null}
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/line-items/search/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:name=>{assert.ok(imports[name]);return imports[name]},process:{env:{}},console,URL});
 const get=source=>module.exports.GET(new Request('https://lab/api/line-items/search'+(source?'?source='+source:'')));
 blocked=true;assert.equal((await get()).status,403);blocked=false;assert.equal((await get()).status,401);assert.equal(reads,0);
 authorized=true;let body=await(await get('hubspot')).json();assert.deepEqual(body.items.map(x=>x.source),['hubspot']);assert.equal(body.total,1);
 body=await(await get('qbo')).json();assert.deepEqual(body.items.map(x=>x.source),['qbo']);
 body=await(await get('all')).json();assert.equal(body.items.length,2);
 assert.equal((await get('unknown')).status,400);assert.equal(module.exports.POST,undefined);
});
