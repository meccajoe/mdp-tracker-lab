import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationAmounts,sumAllocation,summarizeAllocation,sellPercentage,matchLineSku,validSkuReference,type AllocationLine,type SkuReference} from '../src/lib/lab-quote-allocation';
import {readHubSpotSkus} from '../src/lib/lab-hubspot-skus';
const line=(id:string,type='Fabrication',sell=100,purchased=20):AllocationLine=>({id,name:id,type,finalPrice:sell,hoursAllowed:2,materialsBudget:purchased,laborBudget:10,buildBudget:purchased+10});
const ref=():SkuReference=>({quoteId:'123',verifiedAt:'2026-11-16T12:00:00Z',source:'published-quote',workspaceId:'w',revision:1,lines:[{name:'Main Structure',sku:'400100'},{name:'Exact Item',sku:'400801'}],links:[{lineId:'wall',name:'Main Structure',sku:'400100'}]});
test('materials/other partition preserves purchased costs and build totals, including external crews',()=>{
 const lines=[line('wall'),line('crew','Install Support Labor',200,80),line('equipment','Equipment Rental',300,50)];const before=JSON.stringify(lines),total=sumAllocation(lines);
 assert.equal(total.materials,20);assert.equal(total.other,130);assert.equal(total.labor,30);assert.equal(total.build,180);assert.equal(total.materials+total.other+total.labor,total.build);assert.equal(JSON.stringify(lines),before);
 assert.equal(allocationAmounts(lines[1]).materials,0);assert.equal(allocationAmounts(lines[1]).other,80);
 const summary=summarizeAllocation(lines);assert.equal(summary.reduce((s,g)=>s+g.amounts.sell,0),total.sell);assert.equal(summary.reduce((s,g)=>s+g.amounts.build,0),total.build);
});
test('summary/total percentages use summed amounts rather than mean row percentages; zero sell stays unavailable',()=>{
 const lines=[line('a','Fabrication',100,50),line('b','Fabrication',900,90)];const a=sumAllocation(lines);assert.ok(Math.abs(sellPercentage(a.materials,a.sell)!-14)<1e-9);assert.equal(sellPercentage(10,0),null);assert.equal(sellPercentage(150,100),150);assert.equal(sellPercentage(-5,100),-5);
});
test('only unique exact names or explicitly scoped source groups yield SKUs; stale/missing group targets fail closed',()=>{
 const r=ref();assert.equal(matchLineSku(line('wall'),r,'w',1)?.sku,'400100');assert.equal(matchLineSku({...line('x'),name:'Exact Item'},r,'w',1)?.sku,'400801');
 assert.equal(matchLineSku(line('wall'),r,'another',1),null);assert.equal(matchLineSku(line('wall'),r,'w',2),null);assert.equal(matchLineSku(line('unlinked'),r,'w',1),null);
 r.lines[0].sku='408003';assert.equal(matchLineSku(line('wall'),r,'w',1),null);
 r.lines.push({name:'Exact Item',sku:'400100'});assert.equal(matchLineSku({...line('x'),name:'Exact Item'},r,'w',1),null);
 assert.equal(validSkuReference(r,'999'),false);assert.equal(validSkuReference({...r,lines:[null]},'123'),false);assert.equal(validSkuReference({...r,links:{}},'123'),false);
});
test('live SKU adapter reads only the selected quote associations and a bounded batch, with no prices or writes',async()=>{
 const calls:any[]=[];const fetcher:typeof fetch=async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?{id:'123',associations:{line_items:{results:[{id:'10'},{id:'11'}]}}}:{results:[{id:'10',properties:{name:'Wall',hs_sku:'400100'}},{id:'11',properties:{name:'Install',hs_sku:'400300'}}]});};
 const r=await readHubSpotSkus('123','fixture',fetcher);assert.equal(r.lines.length,2);assert.equal(calls[0].options.method,'GET');assert.equal(calls[1].url,'https://api.hubapi.com/crm/v3/objects/line_items/batch/read');assert.deepEqual(JSON.parse(calls[1].options.body).properties,['name','hs_sku']);assert.equal(calls[1].options.redirect,'error');
 await assert.rejects(()=>readHubSpotSkus('123','fixture',async()=>new Response('PRIVATE',{status:403})),/SKU_READ_PERMISSION_REQUIRED/);
 await assert.rejects(()=>readHubSpotSkus('123','fixture',async()=>Response.json({id:'123',associations:{line_items:{results:[],paging:{next:{}}}}})),/TRUNCATED/);
 let n=0;await assert.rejects(()=>readHubSpotSkus('123','fixture',async()=>Response.json(++n===1?{id:'123',associations:{line_items:{results:[{id:'10'}]}}}:{results:[]})),/INCOMPLETE/);
});
