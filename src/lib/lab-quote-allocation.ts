export type AllocationLine={id:string;name:string;type:string;finalPrice:number;hoursAllowed:number;materialsBudget:number;laborBudget:number;buildBudget:number};
export type SkuLine={name:string;sku:string};
export type SkuLink={lineId:string;name:string;sku:string};
export type SkuReference={quoteId:string;verifiedAt:string;sourceUrl?:string;source:'published-quote'|'hubspot-api';lines:SkuLine[];workspaceId?:string;revision?:number;links?:SkuLink[]};
export const normalizedItemName=(name:string)=>name.normalize('NFKC').toLowerCase().replace(/\band\b/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export function validSkuReference(value:unknown,quoteId:string|null|undefined):value is SkuReference {
 const r=value as SkuReference;
 return !!quoteId&&r?.quoteId===quoteId&&Number.isFinite(Date.parse(r.verifiedAt))&&['published-quote','hubspot-api'].includes(r.source)&&Array.isArray(r.lines)&&r.lines.length<=200&&r.lines.every(l=>!!l&&typeof l.name==='string'&&l.name.trim().length>0&&l.name.length<=500&&typeof l.sku==='string'&&l.sku.length<=100)&&
  (r.links===undefined||(Array.isArray(r.links)&&r.links.length<=200&&r.links.every(l=>!!l&&typeof l.lineId==='string'&&typeof l.name==='string'&&typeof l.sku==='string')));
}
export function matchLineSku(line:AllocationLine,reference:SkuReference|null,workspaceId:string,revision:number){
 if(!reference)return null;
 const links=reference.workspaceId===workspaceId&&reference.revision===revision?reference.links?.filter(l=>l.lineId===line.id)??[]:[];
 if(links.length>1)return null;
 if(links.length===1){const link=links[0],matches=reference.lines.filter(r=>r.sku===link.sku&&r.name===link.name);return matches.length===1&&link.sku?{sku:link.sku,name:link.name,shared:true}:null;}
 const matches=reference.lines.filter(r=>normalizedItemName(r.name)===normalizedItemName(line.name));
 return matches.length===1&&matches[0].sku?{...matches[0],shared:false}:null;
}
const materialTypes=new Set(['Fabrication','Graphics','beMatrix / SEG']);
export function allocationAmounts(line:AllocationLine){
 return {sell:line.finalPrice,hours:line.hoursAllowed,labor:line.laborBudget,materials:materialTypes.has(line.type)?line.materialsBudget:0,other:materialTypes.has(line.type)?0:line.materialsBudget,build:line.buildBudget};
}
export type AllocationAmounts=ReturnType<typeof allocationAmounts>;
export function sumAllocation(lines:AllocationLine[]):AllocationAmounts {
 return lines.reduce((sum,line)=>{const a=allocationAmounts(line);for(const k of Object.keys(sum) as (keyof AllocationAmounts)[])sum[k]+=a[k];return sum;},{sell:0,hours:0,labor:0,materials:0,other:0,build:0});
}
export function summarizeAllocation(lines:AllocationLine[]){
 const groups=new Map<string,AllocationLine[]>();for(const l of lines){const list=groups.get(l.type)??[];list.push(l);groups.set(l.type,list);}
 return [...groups].map(([type,items])=>({type,items,amounts:sumAllocation(items)}));
}
export function sellPercentage(cost:number,sell:number){return sell>0?cost/sell*100:null;}
