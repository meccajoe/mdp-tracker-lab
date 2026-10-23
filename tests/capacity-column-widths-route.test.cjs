const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function setup(){
 let permitted=true,updates=[];
 const actor={ok:true,actorId:'signed-in-user',supabase:{auth:{admin:{getUserById:async id=>{assert.equal(id,'signed-in-user');return {data:{user:{user_metadata:{lab_capacity_projects_widths_v1:{Project:350},unrelated:'private'}}}};},updateUserById:async(id,value)=>{updates.push({id,value});return {data:{user:{}}};}}}}};
 const imports={'next/server':{NextResponse:Response},'@/lib/ada-server':{requireQuoteProductAccess:async()=>permitted?actor:{ok:false,response:Response.json({error:'Denied'},{status:401})}}};
 const source=ts.transpileModule(fs.readFileSync('src/app/api/capacity/column-widths/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};const env={NEXT_PUBLIC_SUPABASE_URL:'https://gkvaeqlqrthztobxitvn.supabase.co'};
 vm.runInNewContext(source,{module,exports:module.exports,require:n=>imports[n],Response,Request,URL,process:{env}});
 return {route:module.exports,updates,env,deny(){permitted=false;}};
}
const put=body=>new Request('https://lab.test/api/capacity/column-widths',{method:'PUT',body:JSON.stringify(body)});
test('account widths read only own preferences, never unrelated profile fields',async()=>{
 const {route}=setup();const response=await route.GET(new Request('https://lab.test?table=capacity-projects&userId=other'));
 assert.deepEqual(await response.json(),{userId:'signed-in-user',widths:{Project:350}});assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.deepEqual((await (await route.GET(new Request('https://lab.test?table=capacity-roster'))).json()).widths,null);
});
test('saving widths targets authenticated user and only the allowed metadata key',async()=>{
 const {route,updates}=setup();assert.equal((await route.PUT(put({table:'capacity-roster',widths:{name:400},userId:'other',role:'admin'}))).status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(updates)),[{id:'signed-in-user',value:{user_metadata:{lab_capacity_roster_widths_v1:{name:400}}}}]);
 for(const body of [{table:'__proto__',widths:{}},{table:'capacity-projects',widths:{name:0}},{table:'capacity-projects',widths:{name:'400'}},{table:'capacity-projects',widths:[]}])assert.equal((await route.PUT(put(body))).status,400);
 assert.equal(updates.length,1);
});
test('account preferences require authentication and the lab boundary',async()=>{
 const ctx=setup();ctx.deny();assert.equal((await ctx.route.PUT(put({table:'capacity-projects',widths:{name:300}}))).status,401);
 assert.equal((await ctx.route.GET(new Request('https://lab.test?table=capacity-projects'))).status,401);
 ctx.env.NEXT_PUBLIC_SUPABASE_URL='https://other.supabase.co';assert.equal((await ctx.route.GET(new Request('https://lab.test?table=capacity-projects'))).status,403);assert.equal(ctx.updates.length,0);
});
