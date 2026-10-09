import test from 'node:test';
import assert from 'node:assert/strict';
import type {WorkBook} from 'xlsx';
import fixture from './fixtures/quote-v27/fonroche.json';
import {importV27Workbook,reviewV27Workbook,repairV27Workbook,emptyImportRepair} from '../src/lib/quote-spreadsheet-import';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {capacityProject,capacityLoad,emptyCapacity,quoteDemand} from '../src/lib/capacity';

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
 // Two installers work concurrently; combined person-hours do not extend the window.
 result.document.lines.find(line=>line.id==='line-29')!.inputs.siteDays=3;
 assert.equal(quoteDemand(result.document).fieldDays,4);
 assert.equal(quoteDemand(result.document).field,70);
});
test('missing results, unsupported layouts, unassigned rows and mismatched totals fail before saving',()=>{
 for(const mutate of [(b:WorkBook)=>delete b.Sheets.Settings,(b:WorkBook)=>{b.Sheets['Quote Builder'].P43.v+=1;},(b:WorkBook)=>{b.Sheets['Quote Builder'].B5.v='Unknown';},(b:WorkBook)=>{b.Sheets.Takeoffs.A5.v='Missing parent';},(b:WorkBook)=>{b.Sheets['Quote Builder'].P5={t:'n',f:'formula()'};}]){
  const book=source();mutate(book);assert.throws(()=>importV27Workbook(book,'b'.repeat(64)));
 }
});

test('unused labels survive in notes, but nonzero totals are never discarded',()=>{
 const book=source();book.Sheets.Takeoffs.A86={t:'s',v:'Soldier Lights'};
 const imported=importV27Workbook(book,'c'.repeat(64));
 assert.equal(imported.demand.price,fixture.expected.price);
 assert.match(imported.document.takeoffs.find(r=>r.id==='takeoff-86')!.notes!,/Soldier Lights/);
 assert.match(imported.document.importNotes![0],/unused label/);
 book.Sheets.Takeoffs.H86={t:'n',v:100};
 assert.throws(()=>importV27Workbook(book,'c'.repeat(64)));
 assert.equal(reviewV27Workbook(book).unmatched[0].row,86);
});

test('repair all missing details on a copy, retain audit notes and reconcile unchanged amounts',()=>{
 const book=source(),row=book.Sheets.Takeoffs;
 const originalDescription=row.B5.v,originalItem=row.A5.v;
 row.B5={t:'s',v:''};row.A5={t:'s',v:'Old name'};delete book.Sheets.Settings.B64;
 const before=structuredClone(book),repairs=emptyImportRepair();
 const review=reviewV27Workbook(book);
 assert.equal(review.missingSettings[0].cell,'B64');assert.equal(review.unmatched[0].needsDescription,true);
 assert.throws(()=>repairV27Workbook(book,repairs),/Labor burden/);
 repairs.settings.B64=String(fixture.quote.settings.burdenMultiplier);
 repairs.items[5]=String(originalItem);repairs.descriptions[5]=String(originalDescription);
 const repaired=repairV27Workbook(book,repairs);
 assert.deepEqual(book,before);
 const imported=importV27Workbook(repaired.book,'d'.repeat(64),repaired.notes);
 assert.equal(imported.demand.price,fixture.expected.price);assert.equal(imported.demand.shop,60);
 assert.equal(parseQuoteV27(JSON.parse(JSON.stringify(imported.document))).importNotes?.length,3);
 repairs.items[5]='Not a quote item';assert.throws(()=>repairV27Workbook(book,repairs),/Choose an existing/);
 repairs.items[5]=String(originalItem);repairs.descriptions[5]='   ';assert.throws(()=>repairV27Workbook(book,repairs),/Enter Materials/);
 repaired.book.Sheets['Quote Builder'].P43.v+=100;
 assert.throws(()=>importV27Workbook(repaired.book,'d'.repeat(64),repaired.notes),/does not reconcile/);
});

test('zero is a valid corrected setting, not a missing value',()=>{
 const book=source();delete book.Sheets.Settings.B4;
 const repairs=emptyImportRepair();repairs.settings.B4='0';
 assert.equal(importV27Workbook(repairV27Workbook(book,repairs).book,'e'.repeat(64)).document.settings.contingency,0);
 repairs.settings.B4='-1';assert.throws(()=>repairV27Workbook(book,repairs));
});

test('older v21 layout retains pinned labor rate, separate PM fee and trade hours',()=>{
 const book=source(),old=book.Sheets['Quote Builder'],builder:WorkBook['Sheets'][string]={C3:old.C3};
 for(const [cell,value]of Object.entries(old)){
  const m=/^([A-X]+)(\d+)$/.exec(cell);if(!m)continue;const row=Number(m[2]);
  if(row>=5&&row<=41&&row!==36)builder[`${m[1]}${row+7}`]=structuredClone(value);
 }
 builder.A52={t:'s',v:'SUBTOTAL (before PM fee)'};builder.A54={t:'s',v:'GRAND TOTAL'};
 builder.A53={t:'s',v:'Project management fee'};builder.P53={t:'n',v:1250};
 builder.P54=old.P43;builder.T54=old.T43;book.Sheets['Quote Builder']=builder;
 const settings=book.Sheets.Settings;settings.A61={t:'s',v:'Project Management is NOT a line type'};
 settings.B7={t:'n',v:fixture.expected.laborRate};
 for(const key of Object.keys(settings)){const row=Number(key.slice(1));if(row>=64)delete settings[key];}
 // Legacy support uses site days × crew; one crew member preserves the baseline.
 const support=Object.entries(builder).find(([c,v])=>/^B/.test(c)&&v.v==='Install Support Labor')![0].slice(1);
 builder[`L${support}`]={t:'n',v:1};
 assert.deepEqual(reviewV27Workbook(book).missingSettings,[]);
 const imported=importV27Workbook(book,'f'.repeat(64));
 assert.equal(imported.demand.price,fixture.expected.price);assert.equal(imported.demand.shop,60);
 assert.equal(imported.document.settings.burdenedRateOverride,fixture.expected.laborRate);
 assert.equal(imported.demand.trades.Carpentry,44);
 assert.equal(imported.document.lines.find(l=>l.id==='legacy-pm')?.priceOverride,1250);
 assert.ok(imported.document.trades.every(t=>t.wage===null));
 const previousCharge=Number(builder[`P${support}`].v),previousCost=Number(builder[`T${support}`].v);
 builder[`J${support}`]={t:'n',v:2};builder[`L${support}`]={t:'n',v:3};
 const charge=6*fixture.quote.settings.supportDay,cost=6*fixture.quote.settings.supportCost;
 builder[`N${support}`]={t:'n',v:charge,f:'J*L*rate'};builder[`P${support}`]={t:'n',v:charge};
 builder[`Q${support}`]={t:'n',v:cost};builder[`T${support}`]={t:'n',v:cost};
 builder.P54={t:'n',v:fixture.expected.price-previousCharge+charge};builder.T54={t:'n',v:fixture.expected.buildBudget-previousCost+cost};
 const withCrew=importV27Workbook(book,'f'.repeat(64));
 assert.equal(withCrew.document.lines.find(l=>l.type==='Install Support Labor')?.inputs.siteDays,6);
 assert.equal(withCrew.demand.price,fixture.expected.price-previousCharge+charge);
 builder.S53={t:'n',v:5};assert.throws(()=>importV27Workbook(book,'f'.repeat(64)),/PM costs/);
});
