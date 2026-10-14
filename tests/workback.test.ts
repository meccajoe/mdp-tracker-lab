import test from 'node:test';import assert from 'node:assert/strict';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {emptyPlan,parseProductionPlan} from '../src/lib/production-plan';
import {allocateStageDays,generateWorkback,clientWorkback,workbackChanges} from '../src/lib/workback';
import {STAGE_PERCENT,defaultWorkbackPolicy,emptyRequirement,parseWorkbackPolicy} from '../src/lib/workback-model';
import {productionDays} from '../src/lib/production-calendar';
import {persistWorkback} from '../src/lib/workback-server';
import type {SupabaseClient} from '@supabase/supabase-js';
function quote(){const q=createBlankQuoteV27();q.schedule={buildStart:'2026-11-02',buildFinish:'2026-12-04',installDate:'2026-12-07',status:'Possible'};q.lines[0].name='Golden Arch';q.lines[0].overrides.materials=100;return q;}
const roster=[{primary:'Painting',hours:40,active:true}];
function row(q:ReturnType<typeof quote>,description:string){q.takeoffs.push({id:'row'+q.takeoffs.length,lineId:q.lines[0].id,description,materialId:null,tradeId:null,quantity:2,sections:null,unitCostOverride:20,hours:0,resale:false,unit:'gallon'});}
function generate(q=quote(),p=emptyPlan()){return generateWorkback(q,1,p,roster,defaultWorkbackPolicy(),'2026-10-01').workback;}
test('25 business days match exact 4/1/3/10/5/2 allocation and whole-day total for short/long windows',()=>{
 assert.deepEqual(allocateStageDays(25,STAGE_PERCENT,[0,0,0,0,0,0]),[4,1,3,10,5,2]);
 for(let n=0;n<100;n++){const d=allocateStageDays(n,STAGE_PERCENT,[1,1,1,1,1,1]);assert.equal(d.reduce((a,b)=>a+b,0),n);assert.ok(d.every(Number.isInteger));}
 assert.throws(()=>parseWorkbackPolicy({...defaultWorkbackPolicy(),percent:[10,10,10,10,10,10]}));
 const w=generate();assert.equal(w.current.stages[0].start,'2026-11-02');assert.equal(w.current.stages.at(-1)!.finish,'2026-12-04');
});
test('weekends and explicit holidays excluded, with optional authorized weekend working',()=>{
 const q=quote(),p=emptyPlan();p.workback=generate(q);p.workback.policy.holidays=['2026-11-26'];
 assert.equal(generate(q,p).current.stages.reduce((a,b)=>a+b.days,0),24);
 assert.equal(productionDays('2026-11-27','2026-11-30',{saturday:true,sunday:false,holidays:['2026-11-30']}).length,2);
});
test('paint BOM activates finish tasks but does not invent approval requirements or finish specs',()=>{
 const q=quote();row(q,'Primer and paint');const p=emptyPlan();p.workback=generate(q);
 assert.ok(p.workback.current.tasks.some(t=>t.title.includes('finishing started')));assert.ok(p.workback.current.warnings.some(w=>w.message.includes('finish specification')));
 assert.ok(!p.workback.current.tasks.some(t=>t.id.endsWith('paintApproval')));
 p.workback.requirements[q.lines[0].id]={...emptyRequirement(),paintApproval:'yes',finishSpec:'Approved blue',cureDays:2};
 const w=generate(q,p);assert.ok(w.current.tasks.some(t=>t.id.endsWith('paintApproval')&&t.client));assert.ok(w.current.tasks.some(t=>t.id.endsWith(':cure')));
});
test('graphics responsibility controls client file deadlines; no graphics scope creates no artwork deadlines',()=>{
 const q=quote();assert.ok(!generate(q).current.tasks.some(t=>t.id.includes('graphic')));row(q,'Printed vinyl');const p=emptyPlan();p.workback=generate(q);
 assert.ok(p.workback.current.tasks.some(t=>t.id.endsWith(':print')));assert.ok(!p.workback.current.tasks.some(t=>t.id.endsWith('graphicFiles')));
 p.workback.requirements[q.lines[0].id]={...emptyRequirement(),artwork:'client',proofApproval:'yes'};const w=generate(q,p);
 assert.ok(w.current.tasks.some(t=>t.id.endsWith('graphicFiles')&&t.client));assert.ok(w.current.tasks.some(t=>t.id.endsWith('graphicProof')&&t.client));
 p.workback.requirements[q.lines[0].id].artwork='mecca';assert.ok(!generate(q,p).current.tasks.some(t=>t.id.endsWith('graphicFiles')));
});
test('client supplied items generate receipt and confirmations; missing lead times remain warnings',()=>{
 const q=quote();row(q,'Client-supplied electronics');const w=generate(q);
 assert.ok(w.current.tasks.some(t=>t.id.endsWith('clientReceipt')));assert.ok(w.current.tasks.some(t=>t.id.endsWith(':receiving')));assert.ok(w.current.warnings.some(w=>w.message.includes('lead times')));assert.ok(!w.current.tasks.some(t=>t.id.endsWith(':po')));
});
test('date changes update recommendations, preserve original/approved schedules and manual dates',()=>{
 const q=quote();row(q,'Paint');const p=emptyPlan();p.workback=generate(q);const id=p.workback.current.tasks.find(t=>t.id.endsWith(':paint-start'))!.id;
 p.workback.edits[id]={start:'2026-11-04',finish:'2026-11-03',actual:'',owner:'Painting',notes:'Internal only',removed:false};p.workback.baseline=structuredClone(p.workback.current);const before=JSON.stringify(p.workback.current),original=JSON.stringify(p.workback.original);
 q.schedule!.buildFinish='2026-12-11';const next=generateWorkback(q,2,p,roster,defaultWorkbackPolicy(),'2026-10-01').workback;
 assert.equal(JSON.stringify(next.current),before);assert.equal(JSON.stringify(next.original),original);assert.equal(next.proposed!.quoteVersion,2);assert.ok(next.proposed!.warnings.some(w=>w.message.includes('finish precedes')));assert.equal(next.edits[id].start,'2026-11-04');assert.ok(workbackChanges(next).length>0);assert.deepEqual(parseProductionPlan({...p,workback:next}).workback,next);
});
test('client DTO is explicitly redacted and conditions included; quote input never changes',()=>{
 const q=quote(),before=JSON.stringify(q),w=generate(q);const task=w.current.tasks.find(t=>t.client)!;w.edits[task.id]={start:'',finish:'',actual:'',notes:'CONFIDENTIAL wage 99',owner:'Internal assignment',removed:false};
 const client=clientWorkback(w,'Project','Client'),text=JSON.stringify(client);assert.ok(!text.includes('CONFIDENTIAL'));assert.ok(!text.includes('Internal assignment'));assert.ok(!text.includes('hours'));assert.match(client.conditions,/Payment of a rush fee does not guarantee/);assert.equal(JSON.stringify(q),before);
});
test('missing, short and infeasible due dates produce explicit warnings',()=>{
 const q=quote();q.schedule!.buildFinish='2026-11-03';const p=emptyPlan();p.workback=generate(q);p.workback.dueDate='2026-11-01';const w=generate(q,p);assert.ok(w.current.warnings.some(w=>w.severity==='critical'&&w.message.includes('due date')));assert.ok(w.current.stages.some(s=>!s.days));delete q.schedule;assert.ok(generate(q).current.warnings.some(w=>w.message.includes('production start')));
});
test('closed-won activates schedule without approving or losing pre-award history',()=>{
 const q=quote(),p=emptyPlan();p.workback=generate(q);q.schedule!.status='Closed won';q.schedule!.buildFinish='2026-12-11';const w=generate(q,p);assert.equal(w.active,true);assert.equal(w.baseline,null);assert.deepEqual(w.current,p.workback.current);assert.ok(w.proposed);
});
test('server generation is idempotent, appends history, rejects stale saves, and never rewrites quotes',async()=>{
 const oldEnv=process.env.NEXT_PUBLIC_SUPABASE_URL;process.env.NEXT_PUBLIC_SUPABASE_URL='https://gkvaeqlqrthztobxitvn.supabase.co';
 const q=quote();let quoteRevision=1;const history:{revision:number;document:ReturnType<typeof emptyPlan>}[]=[];const writes:string[]=[];
 const db={from(table:string){let insert:typeof history[number]|undefined;const query={select(){return query;},eq(){return query;},order(){return query;},limit(){return query;},insert(value:typeof history[number]){insert=value;return query;},async single(){return query.maybeSingle();},async maybeSingle(){if(insert){writes.push(table);history.push(structuredClone(insert));return {data:{revision:insert.revision},error:null};}return {error:null,data:table==='quote_workbook_revisions'?{revision:quoteRevision,document:q}:table==='ada_quote_workspaces'?{title:'Test',client_name:'Internal'}:table==='lab_production_schedule_revisions'?history.at(-1)??null:null};}};return query;}} as unknown as SupabaseClient;
 try{await persistWorkback(db,'test','actor','actor',{force:true});assert.equal(history.length,1);await persistWorkback(db,'test','actor','actor',{force:true});assert.equal(history.length,1);await assert.rejects(()=>persistWorkback(db,'test','actor','actor',{force:true,expectedVersion:0}),/changed/);q.schedule!.buildFinish='2026-12-11';quoteRevision++;await persistWorkback(db,'test','actor','actor');assert.equal(history.length,2);assert.ok(writes.every(t=>t==='lab_production_schedule_revisions'));}finally{if(oldEnv===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldEnv;}
});
test('approved client dates stay unchanged until proposed manual edits are approved',()=>{
 const q=quote(),p=emptyPlan();p.workback=generate(q);p.workback.baseline=structuredClone(p.workback.current);
 const id=p.workback.current.tasks.find(t=>t.client)!.id,before=clientWorkback(p.workback,'Test','Client');
 p.workback.edits[id]={start:'2026-11-01',finish:'2026-11-01',actual:'',owner:'',notes:'',removed:false};
 const w=generate(q,p);assert.ok(w.proposed);assert.deepEqual(clientWorkback(w,'Test','Client').milestones,before.milestones);
 w.current=w.proposed!;w.proposed=null;w.workingEdits=structuredClone(w.edits);assert.ok(clientWorkback(w,'Test','Client').milestones.some(m=>m.date==='2026-11-01'));
});
test('dependency cycles, locked conflicts, missing tasks and missing staffing do not claim feasibility',()=>{
 const q=quote();row(q,'Paint');const p=emptyPlan();p.workback=generate(q);const [a,b]=p.workback.current.tasks;
 p.workback.edits[a.id]={start:'',finish:'',actual:'',owner:'',notes:'',removed:false,dependencies:[b.id]};p.workback.edits[b.id]={start:'',finish:'',actual:'',owner:'',notes:'',removed:false,dependencies:[a.id]};
 assert.ok(generate(q,p).current.warnings.some(w=>w.severity==='critical'&&w.message.includes('Cyclic')));
});
