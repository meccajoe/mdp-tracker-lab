import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,rgb,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {QuoteV27} from './quote-v27';
import {quotePerDiem} from './quote-per-diem';
import type {PerDiemRecipients} from './per-diem-recipients';
import {quoteBOM} from './quote-bom';
export type DocumentMeta={project:string;client:string;revision:number};
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const num=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n);
export async function renderProjectDocument(q:QuoteV27,meta:DocumentMeta,kind:'per-diem'|'bom',recipients:PerDiemRecipients={}){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const root=path.join(process.cwd(),'src/assets/cad-fonts');
 const regular=await pdf.embedFont(await readFile(path.join(root,'LiberationSans-Regular.ttf')),{subset:true}),bold=await pdf.embedFont(await readFile(path.join(root,'LiberationSans-Bold.ttf')),{subset:true});
 const chars=new Set(regular.getCharacterSet());
 const clean=(s:string)=>[...s.replace(/[\u0000-\u001f]/g,' ')].map(c=>chars.has(c.codePointAt(0)!)?c:'?').join('');
 const title=kind==='per-diem'?'Per Diem Summary':'Bill of Materials';
 let page:PDFPage,y=0;
 function newPage(){if(pdf.getPageCount()>200)throw Error('Report is too large.');page=pdf.addPage([612,792]);y=724;page.drawText('MECCA DESIGN & PRODUCTION',{x:40,y:758,size:10,font:bold,color:rgb(.15,.28,.3)});page.drawText(`${title} | Quote revision ${meta.revision}`,{x:40,y:741,size:9,font:regular});}
 function lines(s:string,width:number,size=10){const out:string[]=[];let line='';for(const word of clean(s).split(/\s+/)){if(regular.widthOfTextAtSize(line?`${line} ${word}`:word,size)<=width){line=line?`${line} ${word}`:word;continue;}if(line){out.push(line);line='';}for(const c of word){if(regular.widthOfTextAtSize(line+c,size)>width){out.push(line);line='';}line+=c;}}out.push(line);return out;}

 function text(s:string,heading=false){for(const l of lines(s,532,heading?14:10)){if(y<60)newPage();y-=heading?20:14;page.drawText(l,{x:40,y,size:heading?14:10,font:heading?bold:regular});}y-=7;}
 function table(headers:string[],rows:string[][],widths:number[]){
  const draw=(cells:string[],header=false)=>{const wrapped=cells.map((c,i)=>lines(c,widths[i]-10,9)),height=Math.max(...wrapped.map(a=>a.length))*12+12;if(y-height<55){newPage();draw(headers,true);}page.drawRectangle({x:40,y:y-height,width:532,height,color:header?rgb(.9,.94,.94):rgb(.98,.98,.98),borderColor:rgb(.82,.85,.85),borderWidth:.4});let x=45;wrapped.forEach((ls,i)=>{ls.forEach((l,j)=>page.drawText(l,{x,y:y-15-j*12,size:9,font:header?bold:regular}));x+=widths[i];});y-=height;};
  draw(headers,true);rows.forEach(r=>draw(r));y-=12;
 }
 newPage();text(title,true);text(meta.project,true);text(`Client: ${meta.client||'Not specified'} | Saved quote revision: ${meta.revision}`);
 if(kind==='per-diem'){
  const r=quotePerDiem(q);text(`Per diem: ${money(r.perDiem)}   |   Lead road bonus: ${money(r.bonus)}   |   Total allowance: ${money(r.perDiem+r.bonus)}`,true);
  text(`Quoted install date: ${q.schedule?.installDate||'Not specified'} | Dismantle date: ${q.schedule?.dismantleDate||'Not specified'}`);
  text('Quoted allowances only. No payment has been issued by this report. Calendar dates for individual day types: not specified in the quote.');
  for(const p of r.people){text(`${p.label} — ${num(p.days)} road days / ${num(p.trips)} trip(s)`,true);text(`Recipient: ${recipients[p.id]||'NOT ASSIGNED — assign a recipient before issuing payment'}`,true);table(['Day type','Days','Per diem / day','Per diem total','Bonus / day','Bonus total'],p.rows.map(r=>[r.label,num(r.days),money(r.rate),money(r.perDiem),money(r.bonusRate),money(r.bonus)]),[100,42,100,100,90,100]);text(`Subtotal: ${money(p.perDiem)} per diem + ${money(p.bonus)} lead road bonus = ${money(p.perDiem+p.bonus)}`);text(`Lead bonus paid on: ${p.rows.filter(r=>r.days>0&&r.bonusRate>0).map(r=>`${num(r.days)} ${r.label.toLowerCase()} day(s)`).join(', ')||'None quoted'}.`);}
  text('PM review before issuing',true);r.warnings.forEach(w=>text(w));
 }else{
  const renderRows=(rows:ReturnType<typeof quoteBOM>)=>table(['Material','Quantity','Unit','Recorded cost'],rows.map(r=>[r.name,num(r.quantity),r.unit,money(r.cost)]),[280,70,80,102]);
  text('Combined BOM',true);const all=quoteBOM(q);if(all.length)renderRows(all);else text('No material quantities are recorded in takeoffs. Do not treat this as a complete purchasing list.');
  text('Recorded takeoff quantities and costs only. Labor is excluded. Estimator-only frames, allowances and items without a material takeoff require review.');
  for(const [i,item] of q.lines.entries()){const rows=quoteBOM({...q,takeoffs:q.takeoffs.filter(t=>t.lineId===item.id)});if(rows.length){text(`Item ${i+1}: ${item.name}`,true);renderRows(rows);}}
 }
 pdf.getPages().forEach((p,i)=>p.drawText(`Quote revision ${meta.revision} | Page ${i+1} of ${pdf.getPageCount()}`,{x:40,y:29,size:8,font:regular}));return pdf.save();
}
