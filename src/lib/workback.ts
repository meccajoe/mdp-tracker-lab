import type {QuoteV27} from './quote-v27';
import {calculateQuoteV27} from './quote-v27';
import {proposeProductionPlan,type ProductionPlan,type PlannerRoster} from './production-plan';
import {PRODUCTION_STAGES} from './project-timeline';
import {productionDays,isProductionDay,type ProductionCalendar} from './production-calendar';
import {validDate} from './quote-schedule';
import {defaultWorkbackPolicy,emptyRequirement,STAGE_PERCENT,type Workback,type WorkbackPolicy,type WorkbackStage,type WorkbackTask,type WorkbackSnapshot,type Deadline} from './workback-model';
const day=(s:string)=>Date.parse(s+'T00:00:00Z')/86400000;
const iso=(d:number)=>new Date(d*86400000).toISOString().slice(0,10);
export function offsetBusinessDate(date:string,offset:number,calendar:ProductionCalendar){if(!validDate(date))return '';let d=day(date),left=Math.abs(Math.ceil(offset)),direction=offset<0?-1:1;while(left){d+=direction;if(d<day('1900-01-01')||d>day('2200-12-31'))return '';if(isProductionDay(d,calendar))left--;}return iso(d);}
/** Largest remainder, stable stage-order ties. Minimums never create extra days. */
export function allocateStageDays(total:number,percent:number[],minimum:number[]){
 if(percent.length!==6||minimum.length!==6||Math.abs(percent.reduce((a,b)=>a+b,0)-100)>1e-8)throw Error('Stage allocations must total 100%.');
 let result=minimum.reduce((a,b)=>a+b,0)<=total?[...minimum]:[0,0,0,0,0,0];
 let left=total-result.reduce((a,b)=>a+b,0);
 const quotas=percent.map((p,i)=>Math.max(0,total*p/100-result[i])),weight=quotas.reduce((a,b)=>a+b,0);
 const raw=quotas.map(q=>weight?left*q/weight:0);result=result.map((x,i)=>x+Math.floor(raw[i]));left=total-result.reduce((a,b)=>a+b,0);
 const order=raw.map((x,i)=>({i,f:x-Math.floor(x)})).sort((a,b)=>Math.round((b.f-a.f)*1e10)||a.i-b.i);
 for(let i=0;i<left;i++)result[order[i%6].i]++;return result;
}
export function workbackBaseline(quote:QuoteV27,policy:WorkbackPolicy,calendar:ProductionCalendar){
 const days=productionDays(quote.schedule?.buildStart??'',quote.schedule?.buildFinish??'',calendar),counts=allocateStageDays(days.length,policy.percent,policy.minimum);let cursor=0;
 return PRODUCTION_STAGES.map((s,i)=>{const n=counts[i],start=n?iso(days[cursor]):'',finish=n?iso(days[cursor+n-1]):'';cursor+=n;return {id:s.id,name:s.name,percent:policy.percent[i],days:n,start,finish};});
}
export function generateWorkback(quote:QuoteV27,quoteVersion:number,plan:ProductionPlan,roster:PlannerRoster,policy:WorkbackPolicy=defaultWorkbackPolicy(),today=new Date().toISOString().slice(0,10)){
 const previous=plan.workback,settings=previous?.policy??policy,calendar={...plan.calendar,holidays:settings.holidays};
 const base=workbackBaseline(quote,settings,calendar),warnings:WorkbackSnapshot['warnings']=[],tasks:WorkbackTask[]=[];
 const warn=(severity:'info'|'risk'|'critical',message:string)=>warnings.push({severity,message});
 const days=productionDays(quote.schedule?.buildStart??'',quote.schedule?.buildFinish??'',calendar),due=quote.schedule?.dueDate??previous?.dueDate??'',finish=quote.schedule?.buildFinish??'',install=quote.schedule?.installDate??'';
 if(!days.length)warn('critical','Enter valid production start and finish dates. No dates or feasibility have been invented.');
 else {if(days.length<6)warn('critical','Compressed production window: some stages have zero working days.');else if(days.length<15)warn('risk','Production window is substantially shorter than the 25-business-day planning reference.');if(days[0]!==day(quote.schedule!.buildStart)||days.at(-1)!==day(finish))warn('risk','A production boundary falls on a nonworking day. Timeline uses the first/last working day; confirm dates or enable the necessary workday.');}
 if(settings.minimum.reduce((a,b)=>a+b,0)>days.length)warn('critical','Minimum stage durations do not fit. Baseline preserves the actual available days; resolve compressed stages.');
 if(!due)warn('risk','Project due date is not recorded. Installation is kept separate; confirm shipping/delivery buffer.');
 if(due&&finish&&due<finish)warn('critical','Production finish is after the project due date.');
 if(install&&finish&&install<finish)warn('critical','Installation is before production finish.');
 const proposal=proposeProductionPlan(quote,roster,{...plan,calendar});
 for(const message of proposal.warnings)warn(/after|violate|cyclic|unscheduled|exceed/.test(message)?'critical':'risk',message);
 const calc=calculateQuoteV27(quote);
 const effective=(task:WorkbackTask)=>{const edit=previous?.edits[task.id];return {...task,start:edit?.start||task.start,finish:edit?.finish||task.finish,dependencies:edit?.dependencies??task.dependencies,stage:edit?.stage??task.stage};};
 const add=(t:WorkbackTask)=>{tasks.push(t);return t.id;};
 for(const t of proposal.tasks){const stage=t.stage==='graphics'?'finish':t.stage==='other'?'carpentry':t.stage;add({id:'labor:'+t.id,itemId:t.itemId,item:t.item,title:t.trade,stage,start:t.start,finish:t.finish,hours:t.hours,dependencies:t.predecessors.map(id=>'labor:'+id),sources:[t.itemId],client:false});}
 const activeTypes=['Fabrication','Graphics','beMatrix / SEG','Props / Resale','Equipment Rental'];
 for(const line of calc.lines.filter(l=>activeTypes.includes(l.type))){
  const rows=quote.takeoffs.filter(t=>t.lineId===line.id);if(!rows.length&&!line.finalPrice&&!line.hoursAllowed&&!Object.values(line.inputs).some(Boolean))continue;
  const req=previous?.requirements[line.id]??emptyRequirement(),text=rows.map(r=>r.description+' '+(r.notes??'')).join(' ').toLowerCase(),labor=proposal.tasks.filter(t=>t.itemId===line.id);
  const sources=rows.map(r=>r.id),stageStart=(s:WorkbackStage)=>labor.filter(t=>(t.stage==='graphics'?'finish':t.stage)===s).map(t=>t.start).filter(Boolean).sort()[0]||base.find(t=>t.id===s)!.start;
  const stageFinish=(s:WorkbackStage)=>labor.filter(t=>(t.stage==='graphics'?'finish':t.stage)===s).map(t=>t.finish).filter(Boolean).sort().at(-1)||base.find(t=>t.id===s)!.finish;
  const paint=labor.some(t=>t.stage==='finish')||/\b(paint|primer|coating|lacquer|stain|finish)\b/.test(text);
  const graphics=labor.some(t=>t.stage==='graphics')||line.type==='Graphics'||line.inputs.sqft>0||/\b(vinyl|print|printing|graphics|seg)\b/.test(text);
  const cnc=labor.some(t=>t.stage==='cnc')||/\b(cnc|machining)\b/.test(text);
  const carpentry=labor.some(t=>t.stage==='carpentry')||/\b(plywood|mdf|wood|assembly|lumber)\b/.test(text);
  const materialRows=rows.filter(r=>r.quantity>0&&!/^(hours?|hrs?)$/i.test(r.unit??quote.catalog.find(m=>m.id===r.materialId)?.unit??''));
  const supplied=req.clientSupplied||/client[- ]supplied|supplied by client|customer[- ]supplied/.test(text);
  const need=stageStart(cnc?'cnc':carpentry?'carpentry':paint||graphics?'finish':'packing');
  function milestone(key:string,title:string,stage:WorkbackStage,date:string,dependencies:string[]=[],client=false){return add({id:line.id+':'+key,itemId:line.id,item:line.name,title,stage,start:date,finish:date,hours:null,dependencies,sources,client});}
  function deadline(key:Deadline,title:string,stage:WorkbackStage,anchor:string){return milestone(key,title,stage,offsetBusinessDate(anchor,-settings.offsets[key],calendar),[],true);}
  const review=milestone('bom','BOM reviewed / specifications confirmed','purchasing',stageStart('purchasing'));
  milestone('kickoff','Production kickoff / readiness confirmation','purchasing',need,[review]);
  if(materialRows.length){if(req.leadDays===null)warn('risk',`${line.name}: Purchasing must confirm material/vendor lead times; no delivery date assumed.`);else {milestone('po','Purchase orders issued','purchasing',offsetBusinessDate(need,-req.leadDays,calendar),[review]);milestone('receipt','Materials received and verified','purchasing',need,[line.id+':po']);}}
  if(cnc||carpentry){const drawing=milestone('drawing','Construction drawings / internal production review','cad',proposal.tasks.filter(t=>t.stage==='cad').map(t=>t.finish).sort().at(-1)||offsetBusinessDate(need,-1,calendar));
   if(req.drawingApproval==='yes'){deadline('drawingCorrections','Drawing revisions and corrections due','cad',need);deadline('drawingApproval','Final drawing approval','cad',need);}
   else if(req.drawingApproval==='unknown')warn('risk',`${line.name}: confirm whether client drawing approval is required.`);
   milestone('release','Drawing / CNC files released','cad',offsetBusinessDate(need,-1,calendar),[drawing,...(req.drawingApproval==='yes'?[line.id+':drawingApproval']:[])]);
  }
  if(cnc){milestone('cnc-start','CNC cutting started','cnc',stageStart('cnc'),[line.id+':release']);milestone('cnc-check','CNC completed / cut parts verified','cnc',stageFinish('cnc'),[line.id+':cnc-start']);}
  if(carpentry){milestone('assembly-start','Fabrication / structural assembly started','carpentry',stageStart('carpentry'),[cnc?line.id+':cnc-check':line.id+':release']);milestone('fit','Assembly completed / fit check','carpentry',stageFinish('carpentry'),[line.id+':assembly-start']);}
  if(paint){if(!req.finishSpec)warn('risk',`${line.name}: finish specification is missing.`);if(req.paintApproval==='unknown')warn('risk',`${line.name}: confirm client paint/finish approval requirement.`);if(req.paintApproval==='yes')deadline('paintApproval','Paint color / finish approval','finish',stageStart('purchasing')||stageStart('finish'));
   milestone('paint-start','Surface preparation / finishing started','finish',stageStart('finish'),[...(carpentry?[line.id+':fit']:[]),...(req.paintApproval==='yes'?[line.id+':paintApproval']:[])]);
   milestone('paint-end','Finish completed / inspection','finish',stageFinish('finish'),[line.id+':paint-start']);
   if(req.cureDays!==null)milestone('cure','Cure / dry time complete','finish',offsetBusinessDate(stageFinish('finish'),req.cureDays,calendar),[line.id+':paint-end']);else warn('info',`${line.name}: confirm any curing/drying time; none is assumed.`);
  }
  if(graphics){if(req.artwork==='unknown')warn('risk',`${line.name}: artwork responsibility is unknown; client file deadline is not assumed.`);if(req.artwork==='client')deadline('graphicFiles','Client graphic files due','finish',stageStart('finish'));if(req.proofApproval==='unknown')warn('risk',`${line.name}: confirm whether graphic proof approval is required.`);if(req.proofApproval==='yes')deadline('graphicProof','Artwork proof approval','finish',stageStart('finish'));
   milestone('print','Preflight / graphic production','finish',stageStart('finish'),[...(req.artwork==='client'?[line.id+':graphicFiles']:[]),...(req.proofApproval==='yes'?[line.id+':graphicProof']:[])]);
   milestone('graphics-end','Graphics installation / integration complete','finish',stageFinish('finish'),[line.id+':print']);
  }
  if(supplied){deadline('clientReceipt','Client-supplied items received at Mecca','purchasing',need);milestone('receiving','Receiving confirmation / quantity check','purchasing',req.expectedReceipt||need,[line.id+':clientReceipt']);if(!req.details)warn('risk',`${line.name}: record client-supplied item details and quantities.`);if(!req.expectedReceipt)warn('risk',`${line.name}: client-supplied arrival date is unconfirmed.`);}
  if(req.expectedReceipt&&need&&req.expectedReceipt>need)warn('critical',`${line.name}: expected material receipt is after the first dependent activity.`);
  deadline('scopeCutoff','Last day for additions / scope revisions','purchasing',need);deadline('rushCutoff','Rush review cutoff (no automatic fee)','purchasing',need);
  const deps=[...(paint?[line.id+(req.cureDays!==null?':cure':':paint-end')]:[]),...(graphics?[line.id+':graphics-end']:[]),...(carpentry?[line.id+':fit']:[]),...(cnc&&!carpentry?[line.id+':cnc-check']:[]),...(supplied?[line.id+':receiving']:[])];
  milestone('qc','Final QC / punch list completed','packing',stageStart('packing'),deps);
  if(req.preview)milestone('preview','Client preview','packing',stageStart('packing'),[line.id+':qc'],true);
  milestone('ready','Packing / crating complete — ship ready','packing',stageFinish('packing'),[line.id+':qc',...(req.preview?[line.id+':preview']:[])],true);
 }
 tasks.push(...(previous?.custom??[]));
 const ids=tasks.map(t=>t.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate workback task IDs.');
 const live=tasks.filter(t=>!previous?.edits[t.id]?.removed),byId=new Map(live.map(t=>[t.id,effective(t)]));
 for(const removed of tasks.filter(t=>previous?.edits[t.id]?.removed&&t.hours))warn('risk',`${removed.item} / ${removed.title}: hidden from workback but quoted labor remains in capacity. Adjust the estimate to change labor demand.`);
 for(const task of live){const t=effective(task);if(!t.start||!t.finish)warn('risk',`${t.item} / ${t.title}: dates are unconfirmed.`);if(t.start&&t.finish&&t.finish<t.start)warn('critical',`${t.item} / ${t.title}: finish precedes start.`);if(t.finish&&finish&&t.finish>finish)warn('critical',`${t.item} / ${t.title}: finishes after production deadline.`);if(t.client&&t.finish&&t.finish<today&&!previous?.edits[t.id]?.actual)warn('risk',`${t.item} / ${t.title}: deadline has passed; PM review required. No rush fee imposed.`);for(const id of t.dependencies){const dep=byId.get(id);if(!dep)warn('critical',`${t.item} / ${t.title}: missing prerequisite ${id}.`);else if(dep.finish&&t.start&&dep.finish>t.start)warn('critical',`${t.item} / ${t.title}: prerequisite finishes after planned start. Manual dates have not moved.`);}}
 const visited=new Set<string>(),visiting=new Set<string>();const walk=(id:string):boolean=>{if(visiting.has(id))return true;if(visited.has(id))return false;visiting.add(id);for(const dep of byId.get(id)?.dependencies??[])if(walk(dep))return true;visiting.delete(id);visited.add(id);return false;};if(live.some(t=>walk(t.id)))warn('critical','Cyclic workback dependencies must be resolved before approval.');
 const current:WorkbackSnapshot={quoteVersion,stages:base,tasks,warnings,dueDate:due,installDate:install,bufferDays:due&&finish&&due>=finish?productionDays(finish,due,calendar).filter(d=>d>day(finish)).length:null};
 for(const id of Object.keys(previous?.edits??{}))if(!ids.includes(id))warn('risk',`Saved manual milestone ${id} is no longer in quoted scope. Its override/history is retained for review.`);
 const active=['Closed won','In production'].includes(quote.planning?.status||quote.schedule?.status||'');
 const w:Workback=previous?structuredClone(previous):{schema:1,policy:settings,dueDate:due,requirements:{},workingEdits:{},edits:{},custom:[],original:workbackBaseline(quote,{...settings,percent:STAGE_PERCENT,minimum:[0,0,0,0,0,0]},calendar),current,proposed:null,baseline:null,active};
 w.dueDate=due;
 w.active=active;
 if(previous&&(previous.baseline||previous.active||active)){w.proposed=JSON.stringify(current)===JSON.stringify(previous.current)&&JSON.stringify(w.edits)===JSON.stringify(w.workingEdits)?null:current;}else{w.current=current;w.proposed=null;w.workingEdits=structuredClone(w.edits);}
 return {workback:w,proposal,calendar};
}
export function workbackChanges(w:Workback){
 const next=w.proposed??w.current;
 const effective=(t:WorkbackTask,edits:Workback['edits'])=>({...t,start:edits[t.id]?.start||t.start,finish:edits[t.id]?.finish||t.finish,removed:edits[t.id]?.removed??false});
 return next.tasks.flatMap(raw=>{const t=effective(raw,w.edits),oldRaw=w.current.tasks.find(x=>x.id===t.id),old=oldRaw?effective(oldRaw,w.workingEdits):null;return !old||old.start!==t.start||old.finish!==t.finish||old.hours!==t.hours||old.removed!==t.removed?[{id:t.id,item:t.item,title:t.title,before:old?`${old.start} → ${old.finish}`:'New task',after:t.removed?'Removed from workback':`${t.start} → ${t.finish}`,hours:(t.hours??0)-(old?.hours??0)}]:[];}).concat(w.current.tasks.filter(t=>!next.tasks.some(x=>x.id===t.id)).map(t=>({id:t.id,item:t.item,title:t.title,before:`${t.start} → ${t.finish}`,after:'Removed from scope',hours:-(t.hours??0)})));
}
/** Explicit allowlist; never serialize the internal quote, task notes, labor or monetary fields. */
export function clientWorkback(w:Workback,project:string,client:string){return {project,client,status:w.baseline&&!w.proposed?'Approved schedule':'Preliminary — pending review',stages:w.current.stages.map(s=>({name:s.name,start:s.start,finish:s.finish,days:s.days})),milestones:w.current.tasks.filter(t=>t.client&&!w.workingEdits[t.id]?.removed).map(t=>({item:t.item,title:t.title,date:w.workingEdits[t.id]?.finish||t.finish,completed:w.workingEdits[t.id]?.actual||''})),dueDate:w.current.dueDate,installDate:w.current.installDate,conditions:w.policy.conditions};}
