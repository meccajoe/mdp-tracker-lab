import type {WorkBook, WorkSheet} from 'xlsx';
import {calculateQuoteV27, EMPTY_INPUTS, LINE_TYPES, type QuoteV27, type Settings} from './quote-v27';
import {parseQuoteV27} from './quote-v27-validation';
import {quoteDemand} from './capacity';
import {EMPTY_TAKEOFF_DESCRIPTION} from './quote-takeoff-grid';

const SETTING_ROWS = {contingency:4,opex:5,indirect:6,laborSell:8,materialMarkup:11,shopDay:12,efficiency:13,graphicsSell:16,graphicsCost:17,handlingMinutes:18,handlingCrew:19,designSell:22,pmFee:23,pmBonus:25,leadDay:27,supportDay:28,travelFactor:29,pmTravelDay:30,siteHours:31,supportCost:32,offFactor:33,equipmentMarkup:36,resaleMarkup:37,travelMarkup:38,freightMarkup:39,burdenMultiplier:64} as const;
const INPUT_COLUMNS = {materials:'C',resale:'D',hours:'E',days:'F',sqft:'G',panels:'H',rental:'I',siteDays:'J',travelDays:'K',cost:'M'} as const;
export type ImportRepair={settings:Record<string,string>;items:Record<string,string>;descriptions:Record<string,string>};
export const emptyImportRepair=():ImportRepair=>({settings:{},items:{},descriptions:{}});
const savedNumber=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function layout(book:WorkBook){
 const b=sheet(book,'Quote Builder'),s=sheet(book,'Settings');
 const legacy=text(b,'A52')==='SUBTOTAL (before PM fee)'&&text(b,'A54')==='GRAND TOTAL'&&text(s,'A61').includes('NOT a line type');
 return {legacy,last:legacy?50:41,total:legacy?54:43};
}
function emptyEstimate(s:WorkSheet,r:number){return !text(s,`B${r}`)&&['C','I','H','J'].every(c=>number(s,`${c}${r}`)===0);}
export function reviewV27Workbook(book:WorkBook){
 const settings=sheet(book,'Settings'),builder=sheet(book,'Quote Builder'),takeoffs=sheet(book,'Takeoffs');
 const format=layout(book);
 const items=Array.from({length:format.last-4},(_,i)=>i+5).filter(r=>text(builder,`A${r}`)&&LINE_TYPES.includes(text(builder,`B${r}`) as typeof LINE_TYPES[number])).map(r=>text(builder,`A${r}`));
 const counts=new Map<string,number>();items.forEach(name=>counts.set(name,(counts.get(name)??0)+1));
 const choices=items.filter(name=>counts.get(name)===1);
 const missingSettings=Object.entries(SETTING_ROWS).flatMap(([key,row])=>{
  if(format.legacy&&key==='burdenMultiplier')return [];
  const cell=`B${row}`;if(savedNumber(settings[cell]?.v)&&settings[cell]?.t!=='e')return [];
  const label=key==='burdenMultiplier'?'Labor burden multiplier':text(settings,`A${row}`)||key.replace(/([A-Z])/g,' $1');
  return [{cell,label,original:text(settings,cell)}];
 });
 const unmatched: {row:number;name:string;description:string;needsItem:boolean;needsDescription:boolean}[]=[];
 for(let r=5;r<=5004;r++){
  const name=text(takeoffs,`A${r}`),description=text(takeoffs,`B${r}`);
  if(emptyEstimate(takeoffs,r))continue;
  const needsItem=!choices.includes(name),needsDescription=!description;
  if(needsItem||needsDescription)unmatched.push({row:r,name,description,needsItem,needsDescription});
 }
 return {missingSettings,unmatched,choices};
}

/** Corrections apply to a copy. Reconciliation still uses untouched source totals. */
export function repairV27Workbook(book:WorkBook,repairs:ImportRepair){
 const review=reviewV27Workbook(book),copy=structuredClone(book),notes:string[]=[];
 for(const issue of review.missingSettings){
  const raw=repairs.settings[issue.cell]?.trim();if(!raw||!savedNumber(Number(raw)))throw new Error(`Enter ${issue.label} for Settings!${issue.cell}.`);
  copy.Sheets.Settings[issue.cell]={t:'n',v:Number(raw)};
  notes.push(`Settings!${issue.cell}: ${issue.label} manually entered as ${Number(raw)} (source: ${issue.original||'blank'}).`);
 }
 for(const issue of review.unmatched){
  if(issue.needsItem){const name=repairs.items[issue.row];if(!review.choices.includes(name))throw new Error(`Choose an existing quote item for Takeoffs row ${issue.row}.`);copy.Sheets.Takeoffs[`A${issue.row}`]={t:'s',v:name};notes.push(`Takeoffs!A${issue.row}: linked “${issue.name||'(blank)'}” to “${name}”.`);}
  if(issue.needsDescription){const description=repairs.descriptions[issue.row]?.trim();if(!description)throw new Error(`Enter Materials & Labor for Takeoffs row ${issue.row}.`);copy.Sheets.Takeoffs[`B${issue.row}`]={t:'s',v:description};notes.push(`Takeoffs!B${issue.row}: description entered as “${description}”.`);}
 }
 return {book:copy,notes};
}
function sheet(book:WorkBook,name:string):WorkSheet {const value=book.Sheets[name];if(!value)throw new Error(`Missing ${name} tab. Export the complete v27 workbook as .xlsx.`);return value;}
const text=(s:WorkSheet,c:string)=>String(s[c]?.v??'').trim();
function number(s:WorkSheet,c:string,required=false):number {
 const cell=s[c];
 if(cell?.t==='e'||(cell?.f&&cell.v===undefined))throw new Error(`${c}: formula result unavailable. Recalculate and export the spreadsheet again.`);
 if(cell?.v===undefined||cell.v===null||cell.v===''){if(required)throw new Error(`${c}: a saved number is required.`);return 0;}
 if(typeof cell.v!=='number'||!Number.isFinite(cell.v)||cell.v<0)throw new Error(`${c}: expected a nonnegative number.`);
 return cell.v;
}
const nullable=(s:WorkSheet,c:string)=>s[c]?.v==null||s[c]?.v===''?null:number(s,c);
function equal(actual:number,expected:number,label:string,tolerance=.011){if(Math.abs(actual-expected)>tolerance)throw new Error(`${label} does not reconcile (Tracker ${actual.toFixed(2)}, spreadsheet ${expected.toFixed(2)}). No quote was imported.`);}

/** Read cached values only. Never execute formulas, fetch external links or reprice from a live catalog. */
export function importV27Workbook(book:WorkBook,sha256:string,repairNotes:string[]=[]) {
 if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('Invalid source fingerprint.');
 const settingsSheet=sheet(book,'Settings'),builder=sheet(book,'Quote Builder'),takeoffSheet=sheet(book,'Takeoffs'),materials=sheet(book,'Materials DB');
 const format=layout(book);
 const settings={...Object.fromEntries(Object.entries(SETTING_ROWS).map(([key,row])=>[key,format.legacy&&key==='burdenMultiplier'?1:number(settingsSheet,`B${row}`,true)])),burdenedRateOverride:!format.legacy&&settingsSheet.B7?.f?null:number(settingsSheet,'B7',true)} as Settings;
 const quote:QuoteV27={schemaVersion:1,assumptionsVersion:`xlsx-v27-${sha256}`,commission:number(builder,'C3'),settings,trades:[],catalog:[],lines:[],takeoffs:[]};
 const importWarnings:string[]=[];
 for(const address of Object.keys(builder)){const match=/^B(\d+)$/.exec(address);if(match&&Number(match[1])>format.last&&LINE_TYPES.includes(text(builder,address) as typeof LINE_TYPES[number]))throw new Error('Quote Builder has items outside the supported layout. Review its row mapping before importing.');}
 if(!format.legacy)for(let r=66;r<=77;r++){const name=text(settingsSheet,`A${r}`);if(name)quote.trades.push({id:`trade-${r}`,name,wage:nullable(settingsSheet,`B${r}`)});}
 if(format.legacy){
  importWarnings.push(`Older v21 layout: retained the recorded $${settings.burdenedRateOverride}/hr labor cost. No trade wages were guessed. The separate PM fee is retained as an explicit price override; its administrative hours are not shop or field demand.`);
  for(let r=5;r<=5004;r++){const name=text(takeoffSheet,`B${r}`);if(name&&number(takeoffSheet,`I${r}`)>0&&!quote.trades.some(t=>t.name.toLowerCase()===name.toLowerCase()))quote.trades.push({id:`trade-takeoff-${r}`,name,wage:null});}
 }
 const catalogByName=new Map<string,string>();
 for(let r=5;r<=1058;r++){
  if(r>1004&&r<1009)continue;
  const name=text(materials,`A${r}`);if(!name)continue;
  const material={id:`material-${r}`,name,unit:text(materials,`B${r}`),unitCost:number(materials,`C${r}`)};
  quote.catalog.push(material);if(!catalogByName.has(name))catalogByName.set(name,material.id);
 }
 const lineByName=new Map<string,string>();
 for(let r=5;r<=format.last;r++){
  const name=text(builder,`A${r}`),kind=text(builder,`B${r}`);
  if(!kind){if(Object.values(INPUT_COLUMNS).some(col=>number(builder,`${col}${r}`)>0)||number(builder,`P${r}`)>0)throw new Error(`Quote Builder row ${r} has values but no supported line type.`);continue;}
  if(!name||!LINE_TYPES.includes(kind as typeof LINE_TYPES[number]))throw new Error(`Quote Builder row ${r}: missing name or unsupported type “${kind}”.`);
  if(lineByName.has(name))throw new Error(`Duplicate item name “${name}”. Give quote items unique names before importing.`);
  const line:QuoteV27['lines'][number]={id:`line-${r}`,name,type:kind as typeof LINE_TYPES[number],takeoffDriven:true,inputs:{...EMPTY_INPUTS},overrides:{},priceOverride:nullable(builder,`O${r}`)};
  for(const [key,col] of Object.entries(INPUT_COLUMNS) as [keyof typeof INPUT_COLUMNS,string][]){
   const cell=`${col}${r}`,value=number(builder,cell);
   if(['materials','resale','hours'].includes(key)){if(!builder[cell]?.f&&builder[cell]?.v!=null&&builder[cell]?.v!=='')line.overrides[key]=value;}
   else line.inputs[key]=value;
  }
  // A literal calculated-price cell is a manual override, not a new pricing rule.
  if(line.priceOverride===null&&!builder[`N${r}`]?.f&&builder[`N${r}`]?.v!=null)line.priceOverride=number(builder,`N${r}`);
  if(format.legacy&&kind==='Install Support Labor'){
   line.inputs.siteDays=number(builder,`J${r}`)*number(builder,`L${r}`);
   line.inputs.cost=line.inputs.siteDays*settings.supportDay;
  }
  quote.lines.push(line);lineByName.set(name,line.id);
 }
 if(!quote.lines.length)throw new Error('No supported quote items found.');
 if(format.legacy){
  if(number(builder,'S53')||number(builder,'T53'))throw new Error('This older workbook has PM costs requiring a separate migration review.');
  quote.lines.push({id:'legacy-pm',name:text(builder,'A53'),type:'Project Management Fee',takeoffDriven:false,inputs:{...EMPTY_INPUTS},overrides:{},priceOverride:number(builder,'P53',true)});
 }
 // Bounded supported worksheet. Fail rather than silently truncate populated takeoffs.
 for(const address of Object.keys(takeoffSheet)){const match=/^[A-K](\d+)$/.exec(address);if(match&&Number(match[1])>5004&&!takeoffSheet[address]?.f&&text(takeoffSheet,address))throw new Error('Takeoffs exceeds the supported 5,000 rows.');}
 const lastRow=Math.max(4,...Object.keys(takeoffSheet).flatMap(address=>{const match=/^([ABCHIJK])(\d+)$/.exec(address);const populated=match&&(['C','H','I','J'].includes(match[1])?Boolean(takeoffSheet[address]?.v):Boolean(text(takeoffSheet,address)));return match&&Number(match[2])>=5&&populated?[Number(match[2])]:[];}));
 for(let r=5;r<=Math.min(lastRow,5004);r++){
  const name=text(takeoffSheet,`A${r}`),description=text(takeoffSheet,`B${r}`),notes=text(takeoffSheet,`K${r}`);
  if(emptyEstimate(takeoffSheet,r)){
   const unusedLabel=name&&!lineByName.has(name)?`Original spreadsheet item label: ${name}`:'';
   if(unusedLabel)importWarnings.push(`Takeoffs row ${r}: unused label “${name}” retained in Notes; no costs or hours were dropped.`);
   quote.takeoffs.push({id:`takeoff-${r}`,lineId:lineByName.get(name)??'',description:EMPTY_TAKEOFF_DESCRIPTION,materialId:null,tradeId:null,quantity:0,sections:null,unitCostOverride:null,hours:0,resale:false,notes:[notes,unusedLabel].filter(Boolean).join('\n')});continue;
  }
  if(!name||!description||!lineByName.has(name))throw new Error(`Takeoffs row ${r}: materials/labor must belong to a uniquely named Quote Builder item.`);
  const materialId=catalogByName.get(description)??null;
  const unitCost=number(takeoffSheet,`E${r}`),recordedCost=quote.catalog.find(m=>m.id===materialId)?.unitCost;
  const trades=quote.trades.filter(trade=>trade.name.toLowerCase()===description.toLowerCase());
  const resale=text(takeoffSheet,`G${r}`);if(resale&&!['Resale','No','Yes'].includes(resale))throw new Error(`Takeoffs row ${r}: unrecognized resale value “${resale}”.`);
  const row={id:`takeoff-${r}`,lineId:lineByName.get(name)!,description,materialId,tradeId:trades.length===1?trades[0].id:null,quantity:number(takeoffSheet,`C${r}`),sections:nullable(takeoffSheet,`F${r}`),unitCostOverride:takeoffSheet[`E${r}`]?.f&&recordedCost===unitCost?null:unitCost,hours:number(takeoffSheet,`I${r}`),resale:resale==='Resale'||resale==='Yes',unit:text(takeoffSheet,`D${r}`),notes};
  equal(row.quantity*unitCost*(row.sections??1),number(takeoffSheet,`H${r}`),'Takeoffs material total at row '+r);
  equal(row.hours*(row.sections??1),number(takeoffSheet,`J${r}`),'Takeoffs hours at row '+r,.000001);
  quote.takeoffs.push(row);
 }
 if(importWarnings.length||repairNotes.length)quote.importNotes=[...importWarnings,...repairNotes];
 const document=parseQuoteV27(quote),calculation=calculateQuoteV27(document);
 for(const line of calculation.lines){
  if(line.id==='legacy-pm')continue;
  const r=Number(line.id.slice(5));
  for(const [key,col] of Object.entries(INPUT_COLUMNS) as [keyof typeof INPUT_COLUMNS,string][]){
   const expected=format.legacy&&line.type==='Install Support Labor'&&(key==='siteDays'||key==='cost')?number(builder,`J${r}`)*number(builder,`L${r}`)*(key==='cost'?settings.supportDay:1):number(builder,`${col}${r}`);
   equal(line.inputs[key],expected,`${line.name}: ${key}`);
  }
  for(const [key,col] of [['finalPrice','P'],['materialsBudget','Q'],['hoursAllowed','R'],['laborBudget','S'],['buildBudget','T']] as const)equal(line[key],number(builder,`${col}${r}`,true),`${line.name}: ${key}`);
 }
 equal(calculation.totals.price,number(builder,`P${format.total}`,true),'Quote total');
 equal(calculation.totals.buildBudget,number(builder,`T${format.total}`,true),'Build budget');
 const demand=quoteDemand(document);
 return {document,demand,warnings:[
  ...importWarnings,...repairNotes,
  'Install, travel, shipping and beMatrix outputs are imported as recorded Quote Builder inputs. Their detailed estimator worksheets are not imported in this version.',
  'Enter and confirm build dates, install date and forecast status below. No dates or probability are guessed.',
  ...(demand.untyped?[`${demand.untyped} shop hours have no trade assignment. Review these in Capacity.`]:[]),
  ...(demand.overallocated?['Trade hours exceed allowed shop hours. Review trade allocations in Capacity.']:[]),
 ]};
}
