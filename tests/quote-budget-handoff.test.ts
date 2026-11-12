import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {calculateQuoteV27} from '../src/lib/quote-v27';
import {budgetHandoffHours} from '../src/lib/quote-budget-handoff';
function fixture(){
 const q=createBlankQuoteV27();q.estimators=undefined;q.settings.efficiency=1;
 q.lines=q.lines.slice(0,3);q.lines[2].type='Design / Engineering / CAD';q.lines[2].takeoffDriven=false;q.lines[2].inputs.hours=5;
 q.trades=[{id:'cnc',name:'CNC',wage:20},{id:'carpentry',name:'Carpentry',wage:25}];
 q.takeoffs=[{id:'a',lineId:q.lines[0].id,tradeId:'cnc',hours:3,sections:2},{id:'b',lineId:q.lines[0].id,tradeId:'carpentry',hours:4,sections:1},{id:'c',lineId:q.lines[1].id,tradeId:'cnc',hours:2,sections:1},{id:'d',lineId:q.lines[1].id,tradeId:null,hours:1,sections:1},{id:'unassigned',lineId:'',tradeId:'cnc',hours:99,sections:1}].map(row=>({...row,description:'Labor',materialId:null,quantity:0,unitCostOverride:0,resale:false}));
 return q;
}
test('Budget Handoff totals across items include sections and CAD, without double-counting trades or unassigned takeoffs',()=>{
 const q=fixture(),before=JSON.stringify(q),calculation=calculateQuoteV27(q),result=budgetHandoffHours(q,calculation);
 assert.equal(result.total,18);assert.equal(result.assigned,12);assert.equal(result.untyped,6);assert.equal(result.overallocated,0);
 assert.deepEqual(result.trades.map(t=>[t.id,t.hours]),[['carpentry',4],['cnc',8]]);
 assert.equal(result.assigned+result.untyped,result.total);assert.equal(JSON.stringify(q),before);
 assert.deepEqual(calculation,calculateQuoteV27(q));
});
test('manual allowed-hour overrides keep actual trade assignments and expose their mismatch',()=>{
 const q=fixture();q.lines[0].overrides.hours=2;const result=budgetHandoffHours(q,calculateQuoteV27(q));
 assert.equal(result.total,10);assert.equal(result.assigned,12);assert.equal(result.untyped,6);assert.equal(result.overallocated,8);
 assert.equal(result.assigned+result.untyped-result.overallocated,result.total);
});
test('blank handoff reports zero hours rather than fabricated trade demand',()=>{
 const q=createBlankQuoteV27(),{lines,otherHours,purposeHours,needsTradeHours,...totals}=budgetHandoffHours(q,calculateQuoteV27(q));assert.equal(lines.length,q.lines.length);assert.deepEqual(otherHours,[]);assert.equal(purposeHours,0);assert.equal(needsTradeHours,0);assert.deepEqual(totals,{total:0,trades:[],assigned:0,untyped:0,overallocated:0});
});

test('legacy exact unique trade names match Capacity without changing calculations or guessing ambiguous names',()=>{
 const q=fixture();q.takeoffs[0].tradeId=null;q.takeoffs[0].description='CNC';
 const calculation=calculateQuoteV27(q),before=JSON.stringify(calculation),result=budgetHandoffHours(q,calculation);
 assert.equal(result.trades.find(t=>t.id==='cnc')?.hours,8);assert.equal(result.lines[0].tradeHours.cnc,6);assert.equal(result.untyped,6);assert.equal(JSON.stringify(calculation),before);
 q.trades.push({id:'other-cnc',name:'CNC',wage:20});const ambiguous=budgetHandoffHours(q,calculateQuoteV27(q));assert.equal(ambiguous.trades.find(t=>t.id==='cnc')?.hours,2);assert.equal(ambiguous.untyped,12);
});

test('named CAD and installer hours have purposes; only unexplained fabrication hours need a trade',()=>{
 const q=fixture();q.lines[2].inputs.hours=32;
 q.lines.push({...q.lines[2],id:'lead',name:'Lead Installer — Install/Dismantle/Off Days/Travel',type:'Lead Installer — Install',inputs:{...q.lines[2].inputs,hours:0,siteDays:5/q.settings.siteHours}});
 const result=budgetHandoffHours(q,calculateQuoteV27(q));
 assert.equal(result.purposeHours,37);assert.equal(result.needsTradeHours,1);assert.equal(result.untyped,38);
 assert.deepEqual(result.otherHours.filter(line=>line.purposeKnown).map(line=>[line.name,line.hours]),[[q.lines[2].name,32],['Lead Installer — Install/Dismantle/Off Days/Travel',5]]);
 assert.equal(result.otherHours.find(line=>!line.purposeKnown)?.id,q.lines[1].id);
 assert.equal(result.purposeHours+result.needsTradeHours,result.untyped);
});
