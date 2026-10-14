import {calculateQuoteV27, type QuoteV27} from './quote-v27';
import {calculateEstimators} from './quote-v27-estimators';

export type CadMaterial = {description:string; quantity:number; unit:string; notes:string; resale:boolean; row:number};
export type CadItem = {number:number; name:string; type:string; summary:string; materials:CadMaterial[]; labor:string[]; instructions:string[]; warnings:string[]};
export type CadTurnover = {
  project:string; client:string; workspaceId:string; revision:number; generatedAt:string;
  schedule:string[]; bom:{description:string;unit:string;quantity:number}[]; items:CadItem[]; warnings:string[];
};
export const cadUnit = (unit:string,quantity:number) => quantity===1?unit:({sheet:'sheets',panel:'panels',gallon:'gallons',quart:'quarts',lot:'lots',allowance:'allowances',foot:'feet',hour:'hours'}[unit.toLowerCase()]??unit);
export const cadNumber = (n:number) => new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n);

/** Read only the saved snapshot. Never infer a finish, construction method or missing inventory. */
export function buildCadTurnover(quote:QuoteV27, meta:Omit<CadTurnover,'schedule'|'items'|'warnings'|'bom'>):CadTurnover {
  const result=calculateQuoteV27(quote);
  const walls=quote.estimators?calculateEstimators(quote,quote.estimators).walls:[];
  const warnings:string[]=[...(quote.importNotes??[])];
  const meaningful=(row:QuoteV27['takeoffs'][number])=>Boolean(row.quantity||row.hours||row.notes?.trim()||(row.description.trim()&&row.description.trim()!=='Untitled takeoff'));
  const unassigned=quote.takeoffs.flatMap((row,i)=>!row.lineId&&meaningful(row)?[i+1]:[]);
  if(unassigned.length)warnings.push(`Unassigned takeoff rows ${unassigned.join(', ')} are excluded from item BOMs. Assign these rows before using their contents for CAD.`);
  if(walls.some(w=>!w.lineId&&(w.width||w.height||w.sqft)))warnings.push('Unlinked beMatrix walls are excluded from item instructions. Confirm their intended quote item.');
  const items:CadItem[]=[];
  quote.lines.forEach((line,index)=>{
    const calculated=result.lines[index];
    const rows=quote.takeoffs.flatMap((row,i)=>row.lineId===line.id&&meaningful(row)?[{...row,row:i+1}]:[]);
    const linkedWalls=walls.filter(w=>w.lineId===line.id);
    if(!rows.length&&!linkedWalls.length&&!calculated.finalPrice&&!Object.values(calculated.inputs).some(Boolean))return;
    const item:CadItem={number:index+1,name:line.name,type:line.type,summary:'',materials:[],labor:[],instructions:[],warnings:[]};
    const labor=new Map<string,number>();
    for(const row of rows){
      const material=quote.catalog.find(m=>m.id===row.materialId);
      const description=row.description.trim()||material?.name||'Description not recorded';
      const unit=row.unit??material?.unit??'';
      const quantity=row.quantity*(row.sections??1),hours=row.hours*(row.sections??1);
      if(quantity&&!/^(hours?|hrs?)$/i.test(unit.trim()))item.materials.push({description,quantity,unit:unit||'unit not recorded',notes:row.notes??'',resale:row.resale,row:row.row});
      if(hours){const trade=quote.trades.find(t=>t.id===row.tradeId)?.name;
        const label=trade??`${description} (trade not assigned)`;
        labor.set(label,(labor.get(label)??0)+hours);
      }
      if(row.notes?.trim()&&(!quantity||/^(hours?|hrs?)$/i.test(unit.trim())))item.instructions.push(`Takeoff row ${row.row} - ${description}: ${row.notes.trim()}`);
      if(!quantity&&!hours&&row.description.trim()&&!row.notes?.trim())item.instructions.push(`Takeoff row ${row.row}: ${description} - ${row.sections===0?'excluded by a zero section multiplier':'no nonzero quantity or labor allowance recorded'}.`);
      if(quantity&&/^(hours?|hrs?)$/i.test(unit.trim())&&!hours)item.warnings.push(`Row ${row.row}: labor quantity is entered but Labor hours is zero. It is not counted as labor hours.`);
    }
    item.labor=[...labor].map(([name,hours])=>`${name}: ${cadNumber(hours)} quoted takeoff hours.`);
    const takeoffHours=[...labor.values()].reduce((n,h)=>n+h,0);
    if(calculated.hoursAllowed||takeoffHours)item.labor.push(`Quote labor allowance: ${cadNumber(calculated.hoursAllowed)} hours. Recorded takeoff labor: ${cadNumber(takeoffHours)} hours.`);
    if(Math.abs(calculated.hoursAllowed-takeoffHours)>0.001)item.warnings.push('The quote labor allowance differs from the takeoff hours (estimator, efficiency, days or manual override). Do not rescale trade hours without estimator approval.');
    if(rows.length&&!line.takeoffDriven)item.warnings.push('This item is not takeoff-driven. Its takeoff quantities and hours are reference detail; confirm they agree with the quoted scope.');
    const overrides=Object.entries(line.overrides).filter(([key,value])=>value!==null&&value!==undefined&&['materials','resale','hours','days','panels','sqft','rental'].includes(key)).map(([key])=>key);
    if(overrides.length)item.warnings.push(`Manual quote input overrides: ${overrides.join(', ')}. Detailed takeoffs/walls are shown as recorded and are not rescaled.`);
    if((calculated.inputs.materials||calculated.inputs.resale)&&!item.materials.length)item.warnings.push('A material allowance is quoted, but no itemized material quantities were recorded. Request the BOM from the estimator.');
    if(line.type==='beMatrix / SEG'){
      item.instructions.push(`Quoted beMatrix allowance: ${cadNumber(calculated.inputs.panels)} frames/panels and ${cadNumber(calculated.inputs.sqft)} sq ft of SEG graphics.`);
      for(const [i,w] of linkedWalls.entries())item.instructions.push(`Wall ${i+1}: ${cadNumber(w.width)} ft wide x ${cadNumber(w.height)} ft high; ${cadNumber(w.panels)} estimated frames using ${cadNumber(quote.estimators!.beMatrix.frameWidth)} x ${cadNumber(quote.estimators!.beMatrix.frameHeight)} ft estimating modules; SEG ${w.sides===2?'on both sides':w.sides===1?'on one side':'on neither side'}, ${cadNumber(w.sqft)} sq ft${w.sqftOverride!==null?' (area override)':''}.`);
      item.warnings.push(linkedWalls.length?'Frame count is an estimating allowance, not a frame-size or connector schedule. CAD must confirm the frame layout and hardware.':'Detailed wall dimensions, frame layout and SEG sides were not saved. Do not infer them from the total.');
    }
    if(line.type==='Graphics'&&calculated.inputs.sqft)item.instructions.push(`Quoted graphics allowance: ${cadNumber(calculated.inputs.sqft)} sq ft. Confirm artwork, substrate and finish from the recorded materials/notes.`);
    const materials=item.materials.map(m=>`${cadNumber(m.quantity)} ${cadUnit(m.unit,m.quantity)} of ${m.description}`);
    item.summary=`${line.name} was quoted${materials.length?` using ${materials.join('; ')}`:line.type==='beMatrix / SEG'?` with ${cadNumber(calculated.inputs.panels)} estimated beMatrix frames/panels and ${cadNumber(calculated.inputs.sqft)} sq ft of SEG graphics`:' without an itemized material BOM'}.`;
    if(labor.size)item.summary+=` The recorded takeoff includes ${[...labor].map(([name,h])=>`${cadNumber(h)} hours of ${name}`).join('; ')}.`;
    else if(calculated.hoursAllowed)item.summary+=` The quote includes ${cadNumber(calculated.hoursAllowed)} labor hours; trade detail is not recorded.`;
    items.push(item);
  });
  if(!items.length)warnings.push('No active quoted items or detailed takeoffs were recorded.');
  const schedule=quote.schedule?[['Build start',quote.schedule.buildStart],['Build finish',quote.schedule.buildFinish],['Install',quote.schedule.installDate]].map(([label,value])=>`${label}: ${value||'not set'}`):['Build and install dates: not set'];
  const grouped=new Map<string,{description:string;unit:string;quantity:number}>();for(const item of items)for(const material of item.materials){const key=JSON.stringify([material.description,material.unit]);const group=grouped.get(key)??{description:material.description,unit:material.unit,quantity:0};group.quantity+=material.quantity;grouped.set(key,group);}
  return {...meta,schedule,items,warnings,bom:[...grouped.values()]};
}
