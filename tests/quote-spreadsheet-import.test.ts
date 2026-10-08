import test from 'node:test';
import assert from 'node:assert/strict';
import type {WorkBook} from 'xlsx';
import fixture from './fixtures/quote-v27/fonroche.json';
import {importV27Workbook} from '../src/lib/quote-spreadsheet-import';
import {capacityProject,capacityLoad,emptyCapacity} from '../src/lib/capacity';

// Reconstruct the independently extracted source cells, including formula/literal identity.
function source():WorkBook {
 const book:WorkBook={SheetNames:['Settings','Quote Builder','Materials DB','Takeoffs'],Sheets:{}};
 for(const name of book.SheetNames)book.Sheets[name]={};
 function put(s:string,c:string,v:unknown,f?:string){if(v!==null&&v!==undefined)book.Sheets[s][c]={t:typeof v==='number'?'n':'s',v,f};}
 const rows={contingency:4,opex:5,indirect:6,laborSell:8,materialMarkup:11,shopDay:12,efficiency:13,graphicsSell:16,graphicsCost:17,handlingMinutes:18,handlingCrew:19,designSell:22,pmFee:23,pmBonus:25,leadDay:27,supportDay:28,travelFactor:29,pmTravelDay:30,siteHours:31,supportCost:32,offFactor:33,equipmentMarkup:36,resaleMarkup:37,travelMarkup:38,freightMarkup:39,burdenMultiplier:64};
 for(const [key,row] of Object.entries(rows))put('Settings',`B${row}`,fixture.quote.settings[key as keyof typeof fixture.quote.settings]);
 put('Settings','B7',fixture.expected.laborRate,'ROUND(AVERAGE(B66:B77),2)');
 for(const trade of fixture.quote.trades){const r=trade.id.slice(6);put('Settings',`A${r}`,trade.name);put('Settings',`B${r}`,trade.wage);}
 for(const material of fixture.quote.catalog){const r=material.id.slice(9);put('Materials DB',`A${r}`,material.name);put('Materials DB',`B${r}`,material.unit);put('Materials DB',`C${r}`,material.unitCost);}
 put('Quote Builder','C3',fixture.quote.commission);
 const columns={materials:'C',resale:'D',hours:'E',days:'F',sqft:'G',panels:'H',rental:'I',siteDays:'J',travelDays:'K',cost:'M'};
 for(const line of fixture.quote.lines){const r=line.id.slice(5);put('Quote Builder',`A${r}`,line.name);put('Quote Builder',`B${r}`,line.type);
  const related=fixture.quote.takeoffs.filter(row=>row.lineId===line.id);
  for(const [key,col] of Object.entries(columns)){
   let value=line.inputs[key as keyof typeof line.inputs];
   if(key==='hours')value=related.reduce((n,row)=>n+row.hours*(row.sections??1),0);
   if(key==='materials'||key==='resale')value=related.filter(row=>row.resale===(key==='resale')).reduce((n,row)=>n+row.quantity*(row.sections??1)*(row.unitCostOverride??fixture.quote.catalog.find(m=>m.id===row.materialId)?.unitCost??0),0);
   const override=(line.overrides as Record<string,number>)[key];if(override!==undefined)value=override;
   const src=fixture.source.inputSources[`${line.id}.${key}` as keyof typeof fixture.source.inputSources];put('Quote Builder',`${col}${r}`,value,src.formula??undefined);
  }
  put('Quote Builder',`N${r}`,line.priceOverride??0,line.priceOverride===null?'price()':undefined);
  put('Quote Builder',`O${r}`,line.priceOverride);
  const expected=fixture.expected.lines.find(x=>x.id===line.id)!;
  for(const [key,col] of [['finalPrice','P'],['materialsBudget','Q'],['hoursAllowed','R'],['laborBudget','S'],['buildBudget','T']] as const)put('Quote Builder',`${col}${r}`,expected[key],'calculated()');
 }
 for(const row of fixture.quote.takeoffs){const r=row.id.slice(8),cost=row.unitCostOverride??fixture.quote.catalog.find(m=>m.id===row.materialId)?.unitCost??0;
  for(const [col,v] of Object.entries({A:fixture.quote.lines.find(l=>l.id===row.lineId)?.name,B:row.description,C:row.quantity,D:'',E:cost,F:row.sections,G:row.resale?'Resale':'',H:row.quantity*cost*(row.sections??1),I:row.hours,J:row.hours*(row.sections??1),K:'Imported note'}))put('Takeoffs',`${col}${r}`,v,col==='E'&&row.unitCostOverride===null?'lookup()':undefined);
 }
 put('Quote Builder','P43',fixture.expected.price);put('Quote Builder','T43',fixture.expected.buildBudget);
 return book;
}
test('v27 import reconciles original prices, overrides, takeoffs and capacity demand',()=>{
 const result=importV27Workbook(source(),'a'.repeat(64));
 assert.equal(result.demand.price,fixture.expected.price);assert.equal(result.demand.shop,60);assert.equal(result.demand.field,40);assert.equal(result.demand.design,12);
 assert.equal(result.demand.trades.Carpentry,44);assert.equal(result.demand.trades['CNC + cutting'],12);assert.equal(result.demand.trades.Electrical,4);
 assert.equal(result.document.estimators,undefined);assert.equal(result.document.lines.find(l=>l.type==='Project Management Fee')?.priceOverride,1250);
 assert.equal(result.document.takeoffs[0].notes,'Imported note');
 result.document.schedule={buildStart:'2026-10-12',buildFinish:'2026-10-23',installDate:'2026-10-26',status:'Possible'};
 const project=capacityProject({workspaceId:'test',workspace:'Imported test',document:result.document});
 const settings={...emptyCapacity().settings,weekStart:'2026-10-12'};
 assert.equal(capacityLoad([project],settings,'shop').expected.reduce((a,b)=>a+b,0),30);
 assert.equal(capacityLoad([project],settings,'field').expected.reduce((a,b)=>a+b,0),20);
});
test('missing results, unsupported layouts, unassigned rows and mismatched totals fail before saving',()=>{
 for(const mutate of [(b:WorkBook)=>delete b.Sheets.Settings,(b:WorkBook)=>{b.Sheets['Quote Builder'].P43.v+=1;},(b:WorkBook)=>{b.Sheets['Quote Builder'].B5.v='Unknown';},(b:WorkBook)=>{b.Sheets.Takeoffs.A5.v='Missing parent';},(b:WorkBook)=>{b.Sheets['Quote Builder'].P5={t:'n',f:'formula()'};}]){
  const book=source();mutate(book);assert.throws(()=>importV27Workbook(book,'b'.repeat(64)));
 }
});
