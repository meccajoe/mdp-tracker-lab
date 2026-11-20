import test from 'node:test';import assert from 'node:assert/strict';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {quoteDefaults,quoteFromDefaults,cloneQuoteDocument,requiredQuoteNames} from '../src/lib/quote-defaults';
import {calculateQuoteV27} from '../src/lib/quote-v27';
test('new quote defaults are copied independently; existing estimates and settings never change',()=>{
 const source=createBlankQuoteV27(),original=JSON.stringify(source),defaults=quoteDefaults(source);defaults.settings.laborSell=150;defaults.trades[0].wage=50;
 const first=quoteFromDefaults(defaults);defaults.settings.laborSell=200;const second=quoteFromDefaults(defaults);
 assert.equal(first.settings.laborSell,150);assert.equal(second.settings.laborSell,200);assert.equal(JSON.stringify(source),original);assert.equal(calculateQuoteV27(first).totals.price,0);assert.equal(first.takeoffs.length,0);
 assert.throws(()=>quoteFromDefaults({...defaults,settings:{...defaults.settings,waste:1}}));
});
test('cloning preserves quote estimates, literal prices, rates and source while clearing scheduling by default',()=>{
 const q=createBlankQuoteV27();q.lines[0].overrides={materials:1000,hours:10};q.lines[0].priceOverride=3000;q.schedule={buildStart:'2026-10-12',buildFinish:'2026-10-16',installDate:'2026-10-19',status:'Closed won'};
 const original=JSON.stringify(q),clone=cloneQuoteDocument(q);assert.equal(clone.schedule,undefined);assert.deepEqual(calculateQuoteV27(clone),calculateQuoteV27(q));clone.lines[0].name='Changed clone';clone.settings.opex=.2;assert.equal(JSON.stringify(q),original);
 assert.deepEqual(cloneQuoteDocument(q,true).schedule,q.schedule);
});
test('both human project and client names are mandatory and whitespace is rejected',()=>{
 for(const body of [{},{title:'Project'},{title:' ',clientName:'Client'},{title:'Project',clientName:'  '}])assert.throws(()=>requiredQuoteNames(body));
 assert.deepEqual(requiredQuoteNames({title:' Project ',clientName:' Client '}),{title:'Project',clientName:'Client'});
});

import {changeQuoteArchives} from '../src/lib/quote-bulk-archive';
test('bulk archive keeps failed selections, records partial success and restores through existing endpoints',async()=>{
 const calls:string[]=[];const fetcher=async(url:string,init:RequestInit)=>{calls.push(`${init.method} ${url}`);if(url.includes('denied'))return Response.json({error:'Forbidden'},{status:403});if(url.includes('offline'))throw Error('Offline');return Response.json({});};
 const result=await changeQuoteArchives(['one','denied','offline','one'],false,fetcher);assert.deepEqual(result.succeeded,['one']);assert.deepEqual(result.failed,['denied','offline']);assert.equal(calls.length,3);
 await changeQuoteArchives(['one'],true,fetcher);assert.equal(calls.at(-1),'POST /api/quote-workspaces/one/restore');
});

import {defaultStorage} from '../src/lib/quote-storage';
test('storage defaults snapshot all rates for new quotes without copying estimate inputs',()=>{
 const source=createBlankQuoteV27();source.storage=defaultStorage();
 Object.assign(source.storage,{footprint:625,method:3,months:6,lineId:null});
 source.storage.settings={squareFootRate:3,cubicFootRate:.6,floorToCeilingRate:.7,ceilingHeight:24,nonStackableMultiplier:3};
 const original=JSON.stringify(source),defaults=quoteDefaults(source);
 const first=quoteFromDefaults(defaults);
 assert.deepEqual(first.storage?.settings,source.storage.settings);
 assert.equal(first.storage?.footprint,0);assert.equal(first.storage?.lineId,null);
 assert.equal(first.storage?.method,1);assert.equal(first.storage?.billing,'monthly');
 assert.equal(calculateQuoteV27(first).totals.price,0);
 defaults.storageSettings!.squareFootRate=4;
 const second=quoteFromDefaults(defaults);
 assert.equal(first.storage?.settings.squareFootRate,3);assert.equal(second.storage?.settings.squareFootRate,4);
 first.storage!.settings.squareFootRate=5;
 assert.equal(second.storage?.settings.squareFootRate,4);
 assert.equal(JSON.stringify(source),original);
 assert.deepEqual(cloneQuoteDocument(source).storage,source.storage);
});
test('older global defaults get standard storage rates; invalid storage defaults are rejected',()=>{
 const defaults=quoteDefaults(createBlankQuoteV27());delete defaults.storageSettings;
 assert.deepEqual(quoteFromDefaults(defaults).storage,defaultStorage());
 for(const storageSettings of [null,{}, {...defaultStorage().settings,squareFootRate:-1},{...defaultStorage().settings,ceilingHeight:Infinity}]){
  assert.throws(()=>quoteFromDefaults({...defaults,storageSettings}));
 }
});
