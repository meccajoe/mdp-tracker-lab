import {PDFDocument,rgb,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {clientWorkback} from './workback';
export async function renderWorkbackPdf(report:ReturnType<typeof clientWorkback>){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(await readFile(path.join(process.cwd(),'src/assets/cad-fonts/LiberationSans-Regular.ttf')),{subset:true});
 const bold=await pdf.embedFont(await readFile(path.join(process.cwd(),'src/assets/cad-fonts/LiberationSans-Bold.ttf')),{subset:true});
 const supported=new Set(font.getCharacterSet()),clean=(s:string)=>[...s.replace(/[\u0000-\u0008\u000b-\u001f]/g,'')].map(c=>c==='\n'||supported.has(c.codePointAt(0)!)?c:'?').join('');
 let page:PDFPage,y=0;
 function next(){if(pdf.getPageCount()>=150)throw Error('Client schedule exceeds PDF limit.');page=pdf.addPage([612,792]);y=720;page.drawText('MECCA DESIGN & PRODUCTION',{x:42,y:750,size:11,font:bold,color:rgb(.1,.32,.38)});}
 function text(value:string,size=10,heading=false){const f=heading?bold:font;for(const paragraph of clean(value).split('\n')){let line='';const emit=()=>{if(y<55)next();page.drawText(line,{x:42,y,size,font:f});y-=size*1.5;line='';};for(const word of paragraph.split(/\s+/)){if(f.widthOfTextAtSize(line+' '+word,size)>525&&line)emit();for(const char of (line?' ':'')+word){if(f.widthOfTextAtSize(line+char,size)>525)emit();line+=char;}}emit();}y-=5;}
 next();text('Production Workback Schedule',22,true);text(report.project,16,true);text(`Client: ${report.client||'Not recorded'}`);text(report.status);text('Production timeline',13,true);
 for(const s of report.stages)text(`${s.name}  |  ${s.start||'Unscheduled'} – ${s.finish||'Unscheduled'}  |  ${s.days} working days`);
 text(`Project due: ${report.dueDate||'To be confirmed'}   |   Installation: ${report.installDate||'To be confirmed'}`);
 text('Client deliverables and checkpoints',13,true);
 for(const m of report.milestones)text(`${m.date||'To be confirmed'}  |  ${m.item}: ${m.title}${m.completed?' — completed '+m.completed:''}`);
 if(!report.milestones.length)text('No confirmed client deliverable requirements recorded.');
 text('Project Schedule, Client Approvals, and Changes',13,true);text(report.conditions);
 pdf.getPages().forEach((p,i)=>p.drawText(`${i+1} / ${pdf.getPageCount()}`,{x:530,y:28,size:9,font}));return pdf.save();
}
