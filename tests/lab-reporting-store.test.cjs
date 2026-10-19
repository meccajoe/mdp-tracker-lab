const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('report repository uses fixed SELECTs, filters archived projects and refuses partial/error results',async()=>{
 let fail=false,overflow=false,calls=[];
 const db={from(table){
  assert.ok(['lab_capacity_settings_revisions','lab_team_schedule_revisions','ada_quote_workspaces'].includes(table));
  const query={select(value){calls.push([table,'select',value]);return this;},order(){return this;},limit(){return this;},eq(){return this;},neq(k,v){calls.push([table,k,v]);return this;},is(k,v){calls.push([table,k,v]);return this;},range(a,b){this.offset=a;return this;},async maybeSingle(){return {data:null,error:fail?{code:'DENIED'}:null};},then(resolve){
   const rows=overflow?Array.from({length:100},(_,i)=>({id:String(this.offset+i),title:'Project',quote_workbook_revisions:[],lab_production_schedule_revisions:[]})):[{id:'w',title:'Test',quote_workbook_revisions:[{revision:2,document:{}}],lab_production_schedule_revisions:[]}];
   return Promise.resolve({data:rows,error:fail?{code:'DENIED'}:null}).then(resolve);
  }};return query;
 }};
 const imports={
  './quote-v27-validation':{parseQuoteV27:x=>x},'./production-plan':{parseProductionPlan:x=>x},'./lab-reporting':{reportingSettings:()=>({settings:{roster:[]}})}
 };
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/lab-reporting-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:n=>imports[n],Promise});
 const snapshot=await module.exports.loadReportingSnapshot(db);assert.equal(snapshot.quotes.length,1);assert.equal(snapshot.quotes[0].version,2);
 assert.ok(calls.some(c=>c[1]==='lifecycle_status'&&c[2]==='archived'));assert.ok(calls.some(c=>c[1]==='archived_at'&&c[2]===null));
 fail=true;await assert.rejects(module.exports.loadReportingSnapshot(db));fail=false;overflow=true;await assert.rejects(module.exports.loadReportingSnapshot(db),/limit exceeded/);
});
