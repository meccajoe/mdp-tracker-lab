const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture({count=105,fail,delay=0}={}){
 const workspaces=Array.from({length:count},(_,i)=>({id:String(i).padStart(3,'0'),title:`Project ${i}`}));
 let active=0,max=0,reads=[];
 const db={from(table){let id,range;const q={select:()=>q,order:()=>q,limit:()=>q,neq:()=>q,is:()=>q,eq:(_,v)=>(id=v,q),range:(a,b)=>(range=[a,b],q),maybeSingle:()=>q,then(resolve,reject){return (async()=>{
  if(table==='lab_capacity_settings_revisions')return {data:{revision:7,document:{settings:{roster:['staff']}}}};
  if(table==='ada_quote_workspaces')return {data:workspaces.slice(range[0],range[1]+1)};
  active++;max=Math.max(max,active);reads.push(id);
  await new Promise(r=>setTimeout(r,delay?delay+(Number(id)%3):0));active--;
  if(id===fail)return {error:{message:'unavailable'}};
  return {data:Number(id)===2?null:{revision:Number(id)+1,document:{id,table}}};
 })().then(resolve,reject);}};return q;}};
 const imports={'./capacity-versions-server':{capacityVersions:async()=>new Map(workspaces.map(w=>[w.id,{selected:Number(w.id)%2===0}]))},'./project-activation-server':{loadActivationDates:async()=>({'000':'2026-11-01'})},'./capacity':{parseCapacity:x=>x},'./quote-v27-validation':{parseQuoteV27:x=>x},'./production-plan':{parseProductionPlan:x=>x}};
 return {db,imports,stats:()=>({max,reads})};
}
function loader(imports,source=fs.readFileSync('src/lib/team-schedule-server.ts','utf8')){
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:n=>imports[n]});
 return module.exports.teamSources;
}
test('bounded parallel sources preserve ordered data, pagination, missing revisions and selected versions',async()=>{
 const f=fixture(),result=JSON.parse(JSON.stringify(await loader(f.imports)(f.db)));
 assert.equal(result.sources.quotes.length,53);assert.equal(result.quotes.length,52);
 assert.deepEqual(result.sources.quotes.map(x=>x.id),Array.from({length:53},(_,i)=>String(i*2).padStart(3,'0')));
 assert.deepEqual(result.sources.quotes[1],{id:'002',quote:0,plan:0});
 assert.equal(result.quotes[0].activationDate,'2026-11-01');assert.deepEqual(result.roster,['staff']);
 assert.equal(result.sources.roster,7);assert.equal(f.stats().max,12);
 assert.ok(f.stats().reads.every(id=>Number(id)%2===0));
});
test('failed workspace rejects whole source load instead of producing partial schedules',async()=>{
 const f=fixture({fail:'004'});
 await assert.rejects(loader(f.imports)(f.db),/Project 4: saved data unavailable/);
});
test('parallel and serial loading produce identical source inputs despite out-of-order completion',async()=>{
 const source=fs.readFileSync('src/lib/team-schedule-server.ts','utf8');
 const serial=source.replace('start+=6','start+=1').replace('start+6','start+1');
 const a=fixture({count:30,delay:3}),b=fixture({count:30,delay:3});
 const results=await Promise.all([loader(a.imports,source)(a.db),loader(b.imports,serial)(b.db)]);
 assert.equal(JSON.stringify(results[0]),JSON.stringify(results[1]));
 assert.equal(b.stats().max,2);assert.equal(a.stats().max,12);
});
