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
 const q=createBlankQuoteV27();assert.deepEqual(budgetHandoffHours(q,calculateQuoteV27(q)),{total:0,trades:[],assigned:0,untyped:0,overallocated:0});
});
