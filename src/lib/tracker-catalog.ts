import type {Material,Takeoff} from './quote-v27';
export type CatalogEntry=Omit<Material,'unitCost'>&{unitCost:number|null}&{itemId:string;revision:number;deletedAt?:string|null;source:'Google Sheet DB'|'Added from Takeoff'};
export function catalogMaterial(row:{item_id:string;revision:number;name:string;unit:string;unit_cost:number|string|null;source:CatalogEntry['source'];deleted_at?:string|null}):CatalogEntry {
 return {id:`tracker-${row.item_id}-v${row.revision}`,itemId:row.item_id,revision:row.revision,name:row.name,unit:row.unit,unitCost:row.unit_cost===null?null:Number(row.unit_cost),source:row.source,...(row.deleted_at!==undefined?{deletedAt:row.deleted_at}:{})};
}
export function catalogInput(value:unknown){
 const row=value as Record<string,unknown>;
 if(!row||typeof row.name!=='string'||!row.name.trim()||row.name.trim().length>2000||typeof row.unit!=='string'||!row.unit.trim()||row.unit.length>200||typeof row.unitCost!=='number'||!Number.isFinite(row.unitCost)||row.unitCost<0||row.unitCost>1e12)throw new Error('Enter a name, unit and valid unit cost.');
 return {name:row.name.trim(),unit:row.unit.trim(),unitCost:row.unitCost};
}
export function manualCatalogInput(row:Takeoff){
 if(row.materialId||row.description==='Untitled takeoff')return null;
 try{return catalogInput({name:row.description,unit:row.unit,unitCost:row.unitCostOverride});}catch{return null;}
}
const csvCell=(value:string|number)=>{let text=String(value);if(typeof value==='string'&&/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
export function exportCatalogCsv(entries:CatalogEntry[]){
 return '\ufeff'+[['Name','Unit','Unit Cost','Source'],...entries.map(row=>[row.name,row.unit,row.unitCost??'',row.source])].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
