import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument, rgb, type PDFFont, type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {cadNumber, cadUnit, type CadTurnover} from './quote-cad-turnover';

/** Server-side, network-free rendering with bundled, licensed fonts. */
export async function renderCadTurnoverPdf(report:CadTurnover):Promise<Uint8Array> {
  const pdf=await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const root=path.join(process.cwd(),'src/assets/cad-fonts');
  const [regularBytes,boldBytes]=await Promise.all([
    readFile(path.join(root,'LiberationSans-Regular.ttf')),
    readFile(path.join(root,'LiberationSans-Bold.ttf')),
  ]);
  const regular=await pdf.embedFont(regularBytes,{subset:true}),bold=await pdf.embedFont(boldBytes,{subset:true});
  const supported=new Set(regular.getCharacterSet());
  // Unsupported glyphs remain explicit instead of silently disappearing from a specification.
  const clean=(s:string)=>[...s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[\u2010-\u2015]/g,'-')].map(c=>c==='\n'||c==='\t'||supported.has(c.codePointAt(0)!)?c:`[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`).join('');
  const ink=rgb(.12,.18,.24),muted=rgb(.34,.39,.44),blue=rgb(.12,.33,.43),amber=rgb(.48,.29,.05);
  let page:PDFPage,y=0,context='';
  function newPage(){
    if(pdf.getPageCount()>=250)throw new Error('CAD Turnover exceeds 250 pages. Reduce oversized notes before marking Final.');
    page=pdf.addPage([612,792]);y=727;
    page.drawText('MECCA DESIGN & PRODUCTION',{x:42,y:759,size:9,font:bold,color:blue});
    page.drawText(`CAD TURNOVER  |  QUOTE REVISION ${report.revision}`,{x:42,y:744,size:9,font:regular,color:muted});
    page.drawLine({start:{x:42,y:735},end:{x:570,y:735},thickness:.7,color:rgb(.7,.79,.81)});
    if(context){const short=clean(context);let shown=short;while(bold.widthOfTextAtSize(shown,9)>510)shown=shown.slice(0,-1);page.drawText(shown+(shown!==short?'...':''),{x:42,y:y-10,size:9,font:bold,color:muted});y-=29;}
  }
  function wrap(value:string,font:PDFFont,size:number,width:number){
    const lines:string[]=[];
    for(const paragraph of clean(value).split('\n')){
      let line='';
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(font.widthOfTextAtSize(line?`${line} ${word}`:word,size)<=width){line=line?`${line} ${word}`:word;continue;}
        if(line){lines.push(line);line='';}
        for(const char of word){if(font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}line+=char;}
      }
      lines.push(line);
    }
    return lines;
  }
  function text(value:string,{size=10,font=regular,color=ink,indent=0,gap=7}:{size?:number;font?:PDFFont;color?:ReturnType<typeof rgb>;indent?:number;gap?:number}={}){
    const height=size*1.4;
    for(const line of wrap(value,font,size,528-indent)){
      if(y-height<51)newPage();
      y-=height;page.drawText(line,{x:42+indent,y,size,font,color});
    }
    y-=gap;
  }
  function heading(value:string){if(y<110)newPage();text(value,{size:11,font:bold,color:blue,gap:5});}
  newPage();
  text('CAD Turnover',{size:25,font:bold,color:blue});
  text(report.project,{size:18,font:bold});
  text(`Client: ${report.client||'Not recorded'} | Finalized: ${report.generatedAt.slice(0,10)} (UTC)`,{color:muted});
  text(report.schedule.join('   |   '),{size:9,color:muted});
  text('Design to the quoted scope below. Materials, quantities and labor are recorded estimating allowances, not a cut list. Confirm dimensions, frame layouts, connections and missing specifications with the estimator before detailing. No additional waste or procurement rounding has been added.',{size:10});
  if(report.warnings.length){heading('Clarify before CAD');for(const warning of report.warnings)text(`- ${warning}`,{color:amber});}
  for(const item of report.items){
    context='';if(y<220)newPage();
    text(`Item ${item.number} | ${item.name}`,{size:16,font:bold,color:blue});
    context=`Item ${item.number} | ${item.name} (continued)`;
    text(item.type,{size:9,color:muted});
    text(item.summary);
    heading('Materials / BOM');
    if(!item.materials.length)text('No itemized material quantities recorded. See estimator allowances and clarification notes below.',{color:muted});
    for(const m of item.materials){
      text(`${cadNumber(m.quantity)} ${cadUnit(m.unit,m.quantity)}  |  ${m.description}${m.resale?'  [resale]':''}`,{font:bold,gap:2});
      text(`Takeoff row ${m.row}${m.notes?` - ${m.notes}`:''}`,{size:9,color:muted,indent:12,gap:8});
    }
    if(item.labor.length){heading('Labor included in estimate');for(const labor of item.labor)text(labor);}
    if(item.instructions.length){heading('Recorded scope / instructions');for(const instruction of item.instructions)text(instruction);}
    if(item.warnings.length){heading('Estimator clarification');for(const warning of item.warnings)text(`- ${warning}`,{color:amber});}
    y-=12;
  }
  for(const [i,p] of pdf.getPages().entries()){
    p.drawLine({start:{x:42,y:40},end:{x:570,y:40},thickness:.5,color:rgb(.8,.84,.86)});
    p.drawText(`Quote ${report.workspaceId} | Rev ${report.revision}`,{x:42,y:27,size:7,font:regular,color:muted});
    p.drawText(`${i+1} / ${pdf.getPageCount()}`,{x:535,y:27,size:8,font:regular,color:muted});
  }
  pdf.setTitle(`CAD Turnover - ${report.project}`);pdf.setAuthor('Mecca Design & Production');
  pdf.setSubject(`Saved quote revision ${report.revision}; quoted BOM and CAD scope`);
  pdf.setCreationDate(new Date(report.generatedAt));pdf.setModificationDate(new Date(report.generatedAt));
  const bytes=await pdf.save();
  if(bytes.length>6_000_000)throw new Error('CAD Turnover exceeds the 6 MB limit. Reduce oversized notes before marking Final.');
  return bytes;
}
