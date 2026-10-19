const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('reporting route authorizes before any data access, rejects writes, scopes, and hides backend errors',async()=>{
 let identity=null,reads=0,allowed=true,fail=false,logs=[];
 const env={NEXT_PUBLIC_SUPABASE_URL:'https://gkvaeqlqrthztobxitvn.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only'};
 const imports={
  '@supabase/supabase-js':{createClient:(url,key)=>{assert.equal(url,env.NEXT_PUBLIC_SUPABASE_URL);assert.equal(key,'server-only');return {}; }},
  'node:crypto':{randomUUID:()=> 'request-id'},
  '@/lib/lab-reporting-auth':{REPORTING_LAB_URL:env.NEXT_PUBLIC_SUPABASE_URL,reportingIdentity:()=>identity,reportingRateLimit:()=>allowed},
  '@/lib/lab-reporting':{reportOptions:url=>{if(url.searchParams.has('bad'))throw Error('bad');return {report:url.searchParams.get('report')||'projects'};},buildReport:()=>({schemaVersion:1,projects:[]})},
  '@/lib/lab-reporting-store':{loadReportingSnapshot:async()=>{reads++;if(fail)throw Error('SECRET_DATABASE_DETAIL');return {};}}
 };
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/lab-reporting/v1/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:n=>imports[n],process:{env},Response,URL,Buffer,console:{info:line=>logs.push(line)}});
 const route=module.exports,get=query=>route.GET(new Request('https://mdp-tracker-lab.vercel.app/api/lab-reporting/v1'+(query?'?'+query:'')));
 assert.equal((await route.GET(new Request('https://old-deployment.vercel.app/api/lab-reporting/v1'))).status,403);assert.equal(reads,0);assert.equal((await get()).status,401);assert.equal(reads,0);
 identity={id:'bot',reports:['projects']};
 assert.equal((await get('report=roster')).status,403);assert.equal(reads,0);
 assert.equal((await get('bad=1')).status,400);assert.equal(reads,0);
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await route[method]()).status,405);
 const response=await get();assert.equal(response.status,200);assert.equal(reads,1);assert.equal(response.headers.get('cache-control'),'private, no-store');
 fail=true;assert.equal((await get()).status,503);assert.equal(JSON.stringify(logs).includes('SECRET'),false);
 allowed=false;assert.equal((await get()).status,429);assert.equal(reads,2);
 env.NEXT_PUBLIC_SUPABASE_URL='https://production.supabase.co';assert.equal((await get()).status,403);assert.equal(reads,2);
});
