import type {CatalogEntry} from './tracker-catalog';
import {reviewedCatalogGroups} from './catalog-review';

const fractions:Record<string,string>={'⅛':'1/8','¼':'1/4','⅜':'3/8','½':'1/2','⅝':'5/8','¾':'3/4','⅞':'7/8'};
/** Conservative identity: keep species, grades, finishes, packages and all dimensions. */
export function catalogNameKey(name:string){
 const sheet=/mdf|plywood|sheet|birch|maple|mdo|sintra|melamine/i.test(name);
 return name.toLowerCase().replace(/[⅛¼⅜½⅝¾⅞]/g,c=>` ${fractions[c]}`)
 .replace(/[⁄]/g,'/').replace(/[″“”]/g,'"').replace(/[′’]/g,"'").replace(/×/g,'x')
 .replace(/(?<![a-z0-9-])(\d+)[ -]+(\d+)\/(\d+)\b/g,(_,whole,n,d)=>String(Number(whole)+Number(n)/Number(d)))
 .replace(/\b(\d+)\/(\d+)\b/g,(_,n,d)=>String(Number(n)/Number(d)))
 .replace(/\d*\.\d+/g,n=>String(Number(n)))
 .replace(/\b(inches|inch)\b/g,'"').replace(/\b(feet|foot|ft)\b/g,"'")
 .replace(/(\d*\.?\d+)\s*'/g,(_,n)=>String(Number(n)*12))
 .replace(/(?<![\d.])(4|5)\s*x\s*(8|9|10|12)(?![\d."'])/g,(whole,w,h)=>sheet?`${Number(w)*12}x${Number(h)*12}`:whole)
 .replace(/\s*["']?\s*x\s*/g,'x').replace(/["'()]/g,'')
 .replace(/\s+/g,' ').trim().split(' ').sort().join(' ');
}
function unitKey(unit:string){const key=unit.toLowerCase().trim().replace(/\s+/g,' ');return ({sheets:'sheet',hours:'hour',hrs:'hour',hr:'hour',pieces:'each',piece:'each',ea:'each'} as Record<string,string>)[key]??key;}
export function findCatalogDuplicate(input:{name:string;unit:string},entries:CatalogEntry[]){
 const key=catalogNameKey(input.name);
 const known=reviewedCatalogGroups.find(group=>group.some(name=>catalogNameKey(name)===key));
 const keys=new Set((known??[input.name]).map(catalogNameKey));
 const matches=entries.filter(row=>unitKey(row.unit)===unitKey(input.unit)&&keys.has(catalogNameKey(row.name)));
 // Active equivalents take precedence over their archived aliases. Never restore automatically.
 return matches.sort((a,b)=>Number(Boolean(a.deletedAt))-Number(Boolean(b.deletedAt))||(b.unitCost??-1)-(a.unitCost??-1)||a.itemId.localeCompare(b.itemId))[0]??null;
}
