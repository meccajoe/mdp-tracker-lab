import {validDate} from './quote-schedule';
export const WORKBACK_STAGES=['cad','purchasing','cnc','carpentry','finish','packing'] as const;
export type WorkbackStage=typeof WORKBACK_STAGES[number];
export const STAGE_PERCENT=[15,5,10,40,20,10];
export const DEADLINES=['graphicFiles','drawingCorrections','drawingApproval','paintApproval','graphicProof','clientReceipt','scopeCutoff','rushCutoff'] as const;
export type Deadline=typeof DEADLINES[number];
export const CONDITIONS=`Client files, supplied items, and written approvals are required by the deadlines identified in this schedule to maintain the planned production timeline.

Mecca Design & Production reserves the right to evaluate the impact of any requested revisions, additions, or late client deliverables on project scope, cost, production capacity, and schedule before accepting them.

Changes or additions requested after the identified cutoff dates may result in additional costs, including rush fees, and may require adjustments to the delivery or installation schedule.

Payment of a rush fee does not guarantee that a late request can be accommodated. Mecca reserves the right to decline requests that may compromise production quality, existing production commitments, shipping schedules, or installation requirements.

Any approved changes, additional charges, or schedule revisions will be confirmed before the additional work proceeds.`;
export type WorkbackPolicy={holidays:string[];percent:number[];minimum:number[];offsets:Record<Deadline,number>;conditions:string};
export const defaultWorkbackPolicy=():WorkbackPolicy=>({holidays:[],percent:[...STAGE_PERCENT],minimum:[0,0,0,0,0,0],offsets:{graphicFiles:3,drawingCorrections:2,drawingApproval:1,paintApproval:1,graphicProof:1,clientReceipt:1,scopeCutoff:2,rushCutoff:1},conditions:CONDITIONS});
export type Requirement={paintApproval:'unknown'|'yes'|'no';artwork:'unknown'|'client'|'mecca'|'none';drawingApproval:'unknown'|'yes'|'no';proofApproval:'unknown'|'yes'|'no';clientSupplied:boolean;details:string;expectedReceipt:string;leadDays:number|null;cureDays:number|null;finishSpec:string;preview:boolean};
export const emptyRequirement=():Requirement=>({paintApproval:'unknown',artwork:'unknown',drawingApproval:'unknown',proofApproval:'unknown',clientSupplied:false,details:'',expectedReceipt:'',leadDays:null,cureDays:null,finishSpec:'',preview:false});
export type WorkbackEdit={dependencies?:string[];stage?:WorkbackStage;start:string;finish:string;actual:string;owner:string;notes:string;removed:boolean};
export type WorkbackTask={id:string;itemId:string;item:string;title:string;stage:WorkbackStage;start:string;finish:string;hours:number|null;dependencies:string[];sources:string[];client:boolean};
export type WorkbackStageRow={id:WorkbackStage;name:string;percent:number;days:number;start:string;finish:string};
export type WorkbackWarning={severity:'info'|'risk'|'critical';message:string};
export type WorkbackSnapshot={quoteVersion:number;stages:WorkbackStageRow[];tasks:WorkbackTask[];warnings:WorkbackWarning[];dueDate:string;installDate:string;bufferDays:number|null};
export type Workback={schema:1;policy:WorkbackPolicy;dueDate:string;requirements:Record<string,Requirement>;workingEdits:Record<string,WorkbackEdit>;edits:Record<string,WorkbackEdit>;custom:WorkbackTask[];original:WorkbackStageRow[];current:WorkbackSnapshot;proposed:WorkbackSnapshot|null;baseline:WorkbackSnapshot|null;active:boolean};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid workback object.');return v as Record<string,unknown>;};
const text=(v:unknown,max=2000)=>{if(typeof v!=='string'||v.length>max)throw Error('Invalid workback text.');return v;};
const number=(v:unknown,max=10000000)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)throw Error('Invalid workback number.');return v;};
const date=(v:unknown)=>{if(v!==''&&!validDate(v))throw Error('Invalid workback date.');return v as string;};
const bool=(v:unknown)=>{if(typeof v!=='boolean')throw Error('Invalid workback flag.');return v;};
const array=(v:unknown,max=6000)=>{if(!Array.isArray(v)||v.length>max)throw Error('Workback list too large.');return v as unknown[];};
const choice=<T extends string>(v:unknown,options:readonly T[]):T=>{if(!options.includes(v as T))throw Error('Invalid workback choice.');return v as T;};
const record=<T>(v:unknown,parse:(v:unknown)=>T)=>Object.fromEntries(Object.entries(object(v)).map(([k,x])=>[text(k,400),parse(x)]));
export function parseWorkbackPolicy(v:unknown):WorkbackPolicy{const p=object(v),percent=array(p.percent,6).map(x=>number(x,100)),minimum=array(p.minimum,6).map(x=>number(x,365)),offsets=object(p.offsets);
 if(percent.length!==6||minimum.length!==6||Math.abs(percent.reduce((a,b)=>a+b,0)-100)>1e-8||minimum.some(x=>!Number.isInteger(x)))throw Error('Six stage percentages must total 100%; minimum days must be whole numbers.');
 const parsedOffsets=Object.fromEntries(DEADLINES.map(k=>{const n=number(offsets[k],365);if(!Number.isInteger(n))throw Error('Deadline offsets must be whole working days.');return [k,n];})) as Record<Deadline,number>;
 return {holidays:array(p.holidays,1000).map(x=>{const d=date(x);if(!d)throw Error('Empty holiday.');return d;}),percent,minimum,offsets:parsedOffsets,conditions:text(p.conditions,20000)};
}
export function parseRequirement(v:unknown):Requirement{const r=object(v);return {paintApproval:choice(r.paintApproval,['unknown','yes','no']),artwork:choice(r.artwork,['unknown','client','mecca','none']),drawingApproval:choice(r.drawingApproval,['unknown','yes','no']),proofApproval:choice(r.proofApproval,['unknown','yes','no']),clientSupplied:bool(r.clientSupplied),details:text(r.details),expectedReceipt:date(r.expectedReceipt),leadDays:r.leadDays===null?null:number(r.leadDays,365),cureDays:r.cureDays===null?null:number(r.cureDays,365),finishSpec:text(r.finishSpec),preview:bool(r.preview)};}
export function parseWorkbackTask(v:unknown):WorkbackTask{const t=object(v);return {id:text(t.id,400),itemId:text(t.itemId,200),item:text(t.item),title:text(t.title),stage:choice(t.stage,WORKBACK_STAGES),start:date(t.start),finish:date(t.finish),hours:t.hours===null?null:number(t.hours),dependencies:array(t.dependencies,3000).map(x=>text(x,400)),sources:array(t.sources,3000).map(x=>text(x,400)),client:bool(t.client)};}
export function parseWorkbackEdit(v:unknown):WorkbackEdit{const e=object(v);return {...(e.dependencies!==undefined?{dependencies:array(e.dependencies,3000).map(x=>text(x,400))}:{}),...(e.stage!==undefined?{stage:choice(e.stage,WORKBACK_STAGES)}:{}),start:date(e.start),finish:date(e.finish),actual:date(e.actual),owner:text(e.owner,200),notes:text(e.notes),removed:bool(e.removed)};}
function stages(v:unknown):WorkbackStageRow[]{return array(v,6).map(v=>{const s=object(v);return {id:choice(s.id,WORKBACK_STAGES),name:text(s.name),percent:number(s.percent,100),days:number(s.days,110000),start:date(s.start),finish:date(s.finish)};});}
function snapshot(v:unknown):WorkbackSnapshot{const s=object(v);return {quoteVersion:number(s.quoteVersion),stages:stages(s.stages),tasks:array(s.tasks).map(parseWorkbackTask),warnings:array(s.warnings).map(v=>{const w=object(v);return {severity:choice(w.severity,['info','risk','critical']),message:text(w.message)};}),dueDate:date(s.dueDate),installDate:date(s.installDate),bufferDays:s.bufferDays===null?null:number(s.bufferDays,110000)};}
export function parseWorkback(v:unknown):Workback{const w=object(v);if(w.schema!==1)throw Error('Unsupported workback.');const requirements=record(w.requirements,parseRequirement),edits=record(w.edits,parseWorkbackEdit);if(Object.keys(requirements).length>3000||Object.keys(edits).length>6000)throw Error('Workback too large.');return {schema:1,policy:parseWorkbackPolicy(w.policy),dueDate:date(w.dueDate),requirements,workingEdits:record(w.workingEdits??w.edits,parseWorkbackEdit),edits,custom:array(w.custom,1000).map(parseWorkbackTask),original:stages(w.original),current:snapshot(w.current),proposed:w.proposed===null?null:snapshot(w.proposed),baseline:w.baseline===null?null:snapshot(w.baseline),active:bool(w.active)};}
