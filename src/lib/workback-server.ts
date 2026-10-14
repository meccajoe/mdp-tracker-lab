import type {SupabaseClient} from '@supabase/supabase-js';
import {parseQuoteV27} from './quote-v27-validation';
import {emptyPlan,parseProductionPlan,type ProductionPlan} from './production-plan';
import {parseCapacity} from './capacity';
import {generateWorkback} from './workback';
import {defaultWorkbackPolicy,parseWorkback} from './workback-model';
export async function loadWorkback(db:SupabaseClient,workspaceId:string){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')throw Error('Workback is available only in Tracker Lab.');
 const [quote,schedule,roster,workspace]=await Promise.all([
 db.from('quote_workbook_revisions').select('document,revision').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(1).maybeSingle(),
 db.from('lab_production_schedule_revisions').select('document,revision').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(1).maybeSingle(),
 db.from('lab_capacity_settings_revisions').select('document').order('revision',{ascending:false}).limit(1).maybeSingle(),
 db.from('ada_quote_workspaces').select('title,client_name').eq('id',workspaceId).single()]);
 if(quote.error||!quote.data||schedule.error||workspace.error)throw Error('Saved quote or schedule could not load. Existing information is preserved.');
 const document=parseQuoteV27(quote.data.document),plan=schedule.data?parseProductionPlan(schedule.data.document):{...emptyPlan(),quoteVersion:quote.data.revision,calendar:document.productionCalendar??{saturday:false,sunday:false}};
 if(plan.workback)for(const [key,actual] of Object.entries(plan.actuals)){const id='labor:'+key;if(plan.workback.current.tasks.some(t=>t.id===id))plan.workback.edits[id]={...(plan.workback.edits[id]??{start:'',finish:'',owner:'',notes:actual.notes,removed:false}),actual:actual.completed};}
 const capacity=roster.data?parseCapacity(roster.data.document):null;
 const generated=generateWorkback(document,quote.data.revision,plan,capacity?.settings.roster??[],capacity?.settings.workback??defaultWorkbackPolicy());
 return {plan,version:schedule.data?.revision??0,quote:document,quoteVersion:quote.data.revision,roster:capacity?.settings.roster??[],generated,workspace:workspace.data,rosterAvailable:!roster.error&&Boolean(capacity)};
}
export async function persistWorkback(db:SupabaseClient,workspaceId:string,actorId:string,actorEmail:string,options:{expectedVersion?:number;settings?:unknown;approve?:boolean;force?:boolean}={}){
 const loaded=await loadWorkback(db,workspaceId);
 if(options.expectedVersion!==undefined&&options.expectedVersion!==loaded.version)throw Error('Schedule changed on another device. Reload before saving.');
 if(!options.force&&!loaded.plan.workback)return {version:loaded.version,changed:false};
 let plan:ProductionPlan=structuredClone(loaded.plan);
 if(options.settings!==undefined){
  const raw=options.settings as Record<string,unknown>;
  // Clients may edit operational inputs only; generated dates/history/baselines remain authoritative.
  const seed=plan.workback??loaded.generated.workback;
  plan.workback=parseWorkback({...seed,policy:raw.policy,dueDate:raw.dueDate,requirements:raw.requirements,edits:raw.edits,custom:raw.custom});
 }
 if(options.settings!==undefined&&plan.workback)for(const [id,edit] of Object.entries(plan.workback.edits))if(id.startsWith('labor:')){const key=id.slice(6);plan.rules[key]={...plan.rules[key],start:edit.start||undefined,finish:edit.finish||undefined,locked:Boolean(edit.start&&edit.finish),...(edit.dependencies?{predecessors:edit.dependencies.filter(d=>d.startsWith('labor:')).map(d=>d.slice(6))}:{})};}
 const {workback,proposal,calendar}=generateWorkback(loaded.quote,loaded.quoteVersion,plan,loaded.roster,loaded.generated.workback.policy);
 if(options.approve){
  const next=workback.proposed??workback.current;
  if(next.warnings.some(w=>w.severity==='critical'))throw Error('Resolve critical date or dependency conflicts before approving.');
  if(!next.stages.some(s=>s.days>0))throw Error('Enter production dates before approving.');
  workback.current=next;workback.proposed=null;workback.workingEdits=structuredClone(workback.edits);workback.baseline??={...structuredClone(next),tasks:next.tasks.filter(t=>!workback.edits[t.id]?.removed).map(t=>({...t,start:workback.edits[t.id]?.start||t.start,finish:workback.edits[t.id]?.finish||t.finish}))};
  plan.status='approved';plan.baseline=plan.baseline.length?plan.baseline:structuredClone(proposal.tasks);
 }
 for(const [id,edit] of Object.entries(workback.edits))if(id.startsWith('labor:')){const key=id.slice(6),prior=plan.actuals[key];plan.actuals[key]={completed:edit.actual,hours:prior?.hours??null,reason:prior?.reason??'',notes:edit.notes};}
 const updateLabor=options.approve||(!workback.active&&!workback.baseline&&loaded.plan.status!=='approved'&&!loaded.plan.baseline.length);
 plan={...plan,workback,...(updateLabor?{tasks:proposal.tasks,calendar,quoteVersion:loaded.quoteVersion}:{}),...(updateLabor&&!workback.baseline?{status:'proposed' as const}:{})};
 if(JSON.stringify(plan)===JSON.stringify(loaded.plan))return {version:loaded.version,changed:false};
 const currentQuote=await db.from('quote_workbook_revisions').select('revision').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(1).single();
 if(currentQuote.error||currentQuote.data.revision!==loaded.quoteVersion)throw Error('Quote changed during schedule generation. Retry with the latest revision.');
 const result=await db.from('lab_production_schedule_revisions').insert({workspace_id:workspaceId,revision:loaded.version+1,document:plan,created_by:actorId,created_by_email:actorEmail}).select('revision').single();
 if(result.error)throw Error(['PT409','23505'].includes(result.error.code)?'Schedule changed on another device. Reload before saving.':'Workback could not save. The previous schedule is preserved.');
 return {version:result.data.revision,changed:true};
}
