import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {loadActivationDates} from '../src/lib/project-activation-server';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const row=(id:string,revision:number,active=false)=>({workspace_id:id,revision,created_at:`2026-10-${active?'24':'26'}T02:00:00Z`,project_status:active?'Active':'Not Active',forecast_status:'Possible',planning_status:null});
function harness(rows:ReturnType<typeof row>[],failures:Record<number,{status:number;code:string}>={}){
 const calls:URL[]=[];
 const db=createClient('https://example.invalid','test-only-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input)=>{
  const url=new URL(String(input));calls.push(url);const q=url.searchParams;
  assert.equal(url.pathname,'/rest/v1/quote_workbook_revisions');assert.equal(q.get('order'),'workspace_id.asc,revision.asc');
  assert.ok(q.get('select')?.includes('project_status:document->schedule->>projectStatus'));
  assert.equal(q.has('offset'),false);
  if(failures[calls.length]){const f=failures[calls.length];return new Response(JSON.stringify({code:f.code,message:'test failure'}),{status:f.status});}
  let available=rows;
  if(q.has('workspace_id'))available=available.filter(r=>r.workspace_id===q.get('workspace_id')!.slice(3));
  if(q.has('revision'))available=available.filter(r=>r.revision<=Number(q.get('revision')!.slice(4)));
  const cursor=q.get('or')?.match(/workspace_id.gt.([^,]+),and\(workspace_id.eq.([^,]+),revision.gt.(\d+)\)/);
  if(q.has('or'))assert.ok(cursor,'valid seek cursor');
  if(cursor)available=available.filter(r=>r.workspace_id>cursor[1]||(r.workspace_id===cursor[1]&&r.revision>Number(cursor[3])));
  return Response.json(available.slice(0,Number(q.get('limit'))));
 }}});
 return {db,calls};
}
test('history seeks through full pages, retains earliest activation and respects revision scope',async()=>{
 const rows=[...Array.from({length:400},(_,i)=>row(a,i+1,i===201||i===399)),row(b,1,true)];
 const h=harness(rows);const result=await loadActivationDates(h.db);
 assert.deepEqual({...result},{[a]:'2026-10-23',[b]:'2026-10-23'});assert.equal(h.calls.length,3);
 assert.ok(h.calls[2].searchParams.get('or')?.includes('revision.gt.400'));
 const scoped=harness(rows);assert.deepEqual({...await loadActivationDates(scoped.db,a,201)},{});
 assert.ok(scoped.calls.every(u=>u.searchParams.get('revision')==='lte.201'&&u.searchParams.get('workspace_id')===`eq.${a}`));
});
test('empty and exact-page histories finish without a range-out-of-bounds request',async()=>{
 const empty=harness([]);assert.deepEqual({...await loadActivationDates(empty.db)},{});
 const full=harness(Array.from({length:200},(_,i)=>row(a,i+1,i===0)));
 assert.equal((await loadActivationDates(full.db))[a],'2026-10-23');assert.equal(full.calls.length,2);
});
test('temporary timeout retries the same page and returns complete activation dates',async()=>{
 const h=harness([...Array.from({length:200},(_,i)=>row(a,i+1)),row(b,1,true)],{2:{status:500,code:'57014'}});
 assert.deepEqual({...await loadActivationDates(h.db)},{[b]:'2026-10-23'});
 assert.equal(h.calls[1].toString(),h.calls[2].toString());
});
test('permission failures do not retry or return partial history',async()=>{
 const h=harness(Array.from({length:200},(_,i)=>row(a,i+1,true)),{2:{status:403,code:'42501'}});
 await assert.rejects(loadActivationDates(h.db),/history could not load/);assert.equal(h.calls.length,2);
});
test('repeated service failures stop after three attempts instead of silently using fallback dates',async()=>{
 const failure={status:503,code:'PGRST002'},h=harness([],{1:failure,2:failure,3:failure});
 await assert.rejects(loadActivationDates(h.db),/history could not load/);assert.equal(h.calls.length,3);
});
