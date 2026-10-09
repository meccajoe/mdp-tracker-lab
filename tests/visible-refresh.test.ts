import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisibleRefresh} from '../src/lib/visible-refresh';
const deferred=()=>{let resolve!:(v:number)=>void;const promise=new Promise<number>(r=>resolve=r);return {promise,resolve};};
test('slow periodic overlaps are single-flight; post-save refresh drains a genuinely newer read',async()=>{
  const first=deferred(),second=deferred();let reads=0;const applied:number[]=[];
  const controller=createVisibleRefresh(()=>++reads===1?first.promise:second.promise,n=>applied.push(n),()=>{},()=>true);
  const running=controller.request();assert.equal(controller.request(),running);assert.equal(reads,1);
  const saved=controller.request(true);first.resolve(1);await new Promise(r=>setTimeout(r,0));assert.equal(reads,2);assert.deepEqual(applied,[]);
  second.resolve(2);await saved;assert.deepEqual(applied,[2]);controller.dispose();
});
test('hidden ticks do not fetch; immediate show refresh discards pre-hide result',async()=>{
  let visible=false,reads=0;const pending=deferred(),applied:number[]=[];
  const controller=createVisibleRefresh(()=>{reads++;return reads===1?pending.promise:Promise.resolve(2);},n=>applied.push(n),()=>{},()=>visible);
  await controller.request();await controller.request();assert.equal(reads,0);
  visible=true;const run=controller.request(true);visible=false;controller.pause();pending.resolve(1);await run;assert.deepEqual(applied,[]);
  visible=true;await controller.request(true);assert.equal(reads,2);assert.deepEqual(applied,[2]);
});
test('show during an outstanding hidden read queues exactly one fresh visible read',async()=>{
  let visible=true,reads=0;const pending=deferred(),applied:number[]=[];
  const controller=createVisibleRefresh(()=>++reads===1?pending.promise:Promise.resolve(2),n=>applied.push(n),()=>{},()=>visible);
  const run=controller.request();visible=false;controller.pause();visible=true;void controller.request(true);pending.resolve(1);await run;
  assert.equal(reads,2);assert.deepEqual(applied,[2]);
});
test('unmount protects both late success and late failure',async()=>{
  const pending=deferred();let applied=0;
  const controller=createVisibleRefresh(()=>pending.promise,()=>applied++,()=>applied++,()=>true);
  const run=controller.request();controller.dispose();pending.resolve(1);await run;assert.equal(applied,0);await controller.request();assert.equal(applied,0);
});
test('unsaved planning editor pauses automatic reads until closed; errors permit retry',async()=>{
  let editing=true,reads=0,errors=0;
  const controller=createVisibleRefresh(async()=>{reads++;if(reads===1)throw new Error('Incomplete');return 2;},()=>{},()=>errors++,()=>!editing);
  await controller.request();assert.equal(reads,0);editing=false;await controller.request(true);assert.equal(errors,1);await controller.request();assert.equal(reads,2);
});
