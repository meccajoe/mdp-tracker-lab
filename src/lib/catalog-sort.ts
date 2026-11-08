import {catalogUsageCount} from './catalog-review';
const fractions:Record<string,string>={'⅛':'1/8','¼':'1/4','⅜':'3/8','½':'1/2','⅝':'5/8','¾':'3/4','⅞':'7/8'};
const number='(?:\\d+[ -]+\\d+/\\d+|\\d+/\\d+|\\d*\\.\\d+|\\d+)';
function value(text:string){const mixed=text.trim().split(/[ -]+/);return mixed.reduce((sum,part)=>{const [a,b]=part.split('/').map(Number);return sum+(b?a/b:a);},0);}
/** Sort dimensions, not the text representation of fractions. Values are inches. */
export function catalogDimensions(name:string):number[]{
 const text=name.toLowerCase().replace(/[⅛¼⅜½⅝¾⅞]/g,c=>` ${fractions[c]}`).replace(/[″“”]/g,'"').replace(/[′’]/g,"'").replace(/×/g,'x');
 const sheet=/plywood|mdf|sheet|sintra|panel|melamine|lauan|luan|meranti|birch|maple|mdo|hardboard/.test(text);
 const dimensions:number[]=[];
 const chain=new RegExp(`(?<![a-z0-9-])(${number})\\s*(mm|inches|inch|in|ft|feet|'|\")?\\s*x\\s*(${number})\\s*(mm|inches|inch|in|ft|feet|'|\")?(?:\\s*x\\s*(${number})\\s*(mm|inches|inch|in|ft|feet|'|\")?)?`,'g');
 const convert=(n:number,unit:string|undefined)=>unit==='mm'?n/25.4:unit==="'"||unit==='ft'||unit==='feet'?n*12:n;
 let remaining=text;
 for(const match of text.matchAll(chain)){
  const vals=[value(match[1]),value(match[3])];if(match[5])vals.push(value(match[5]));
  const units=[match[2],match[4],match[6]];
  if(/steel|metal|alumin/.test(text)&&/tub/.test(text)&&vals.length===3&&vals[2]>=7&&!units[2])vals[2]=1/vals[2];
  // Catalog sheet footprints such as 4x8 and 5x12 are feet; 48x96 are inches.
  const footprint=sheet&&Math.min(vals[0],vals[1])>=4&&Math.min(vals[0],vals[1])<=5&&Math.max(vals[0],vals[1])>=5&&Math.max(vals[0],vals[1])<=12;
  vals.forEach((n,i)=>dimensions.push(convert(n,units[i]??(footprint&&i<2?'ft':undefined))));
  remaining=remaining.replace(match[0],' ');
 }
 for(const match of remaining.matchAll(new RegExp(`(?<![a-z0-9-])(${number})\\s*(mm|inches|inch|in\\b|ft\\b|feet|\"|')`,'g')))dimensions.push(convert(value(match[1]),match[2]));
 // Plain sheet thickness (MDF 1/4 4X8); model/brand numbers are not dimensions.
 if(sheet&&!dimensions.some(n=>n<4)){
  const thickness=remaining.match(/\b(\d+\/\d+|0?\.\d+)\b/);if(thickness)dimensions.push(value(thickness[1]));
 }
 const gauge=text.match(/(\d+)\s*(?:gauge|ga\b)/);
 if(gauge)dimensions.push(1/Number(gauge[1])); // higher gauge is thinner
 return dimensions.sort((a,b)=>a-b);
}
export function compareCatalogChoices(a:{name:string},b:{name:string},usage:Record<string,number>={}){
 const popular=catalogUsageCount(b.name,usage)-catalogUsageCount(a.name,usage);if(popular)return popular;
 const left=catalogDimensions(a.name),right=catalogDimensions(b.name);
 if(Boolean(left.length)!==Boolean(right.length))return left.length?-1:1;
 if(left.length&&right.length){for(let i=0;i<Math.max(left.length,right.length);i++){const x=left[i]??Infinity,y=right[i]??Infinity;if(x!==y&&Math.abs(x-y)>0.00001)return x-y;}}
 return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
}
