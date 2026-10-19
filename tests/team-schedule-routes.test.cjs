const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('team API builds only from server sources and rejects stale/unauthorized approvals',async()=>{
 let allowed=false,latest=null,inserts=[],sources={roster:1,quotes:[]};
 const db={from:()=>{const q={select:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:latest}),insert:row=>{inserts.push(row);return {select:()=>({single:async()=>({data:{revision:row.revision}})})}}};return q;}};
 const imports={'@/lib/ada-server':{requireQuoteProductAccess:async()=>allowed?{ok:true,actorSupabase:db,actorId:'a',actorEmail:'paul@meccadesign.com'}:{ok:false,response:Response.json({}, {status:403})}},'@/lib/team-schedule-server':{teamSources:async()=>({quotes:[],roster:[],sources})},'@/lib/team-schedule-source':{buildTeamSchedule:()=>({allocations:['server-generated']})},'@/lib/team-schedule':{parseTeamOptions:o=>o}};
 const source=ts.transpileModule(fs.readFileSync('src/app/api/capacity/team-schedule/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,module={exports:{}},env={NEXT_PUBLIC_SUPABASE_URL:'https://gkvaeqlqrthztobxitvn.supabase.co'};
 vm.runInNewContext(source,{module,exports:module.exports,require:n=>imports[n],Response,Request,JSON,Number,Error,process:{env}});
 const post=b=>module.exports.POST(new Request('https://test',{method:'POST',body:JSON.stringify(b)}));
 assert.equal((await post({action:'generate',expectedVersion:0})).status,403);allowed=true;
 assert.equal((await post({action:'generate',expectedVersion:0,options:{},document:{tampered:true}})).status,201);assert.deepEqual(inserts[0].document.result.allocations,['server-generated']);
 latest={revision:1,status:'proposed',document:inserts[0].document};sources={roster:2,quotes:[]};assert.equal((await post({action:'approve',expectedVersion:1})).status,409);assert.equal(inserts.length,1);
 sources={roster:1,quotes:[]};assert.equal((await post({action:'approve',expectedVersion:1})).status,201);assert.equal(inserts[1].status,'approved');
 env.NEXT_PUBLIC_SUPABASE_URL='https://wrong.supabase.co';assert.equal((await post({action:'generate',expectedVersion:1})).status,403);
});
