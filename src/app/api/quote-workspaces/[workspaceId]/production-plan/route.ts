import {requireQuoteProductWorkspaceAccess} from '@/lib/ada-server';
import {canPerformQuoteAction} from '@/lib/quote-permissions';
import {parseProductionPlan} from '@/lib/production-plan';
export const dynamic='force-dynamic';
type Context={params:Promise<{workspaceId:string}>};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(id:string,edit=false){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co'||! /^[0-9a-f-]{36}$/i.test(id))return {ok:false as const,response:json({error:'Lab schedule access only.'},403)};
 return requireQuoteProductWorkspaceAccess(id,edit?'edit_draft':'view_workspace');
}
export async function GET(_request:Request,{params}:Context){
 const {workspaceId}=await params,a=await access(workspaceId);if(!a.ok)return a.response;
 const result=await a.actorSupabase.from('lab_production_schedule_revisions').select('revision,document,created_at').eq('workspace_id',workspaceId).order('revision',{ascending:false}).limit(1).maybeSingle();
 if(result.error)return json({error:['42P01','PGRST205'].includes(result.error.code)?'Schedule storage needs Joe’s lab migration. Proposals can be reviewed but not saved yet.':'Schedule storage could not load.',ready:false},503);
 try{return json({ready:true,version:result.data?.revision??0,document:result.data?parseProductionPlan(result.data.document):null,canEdit:a.workspaceLifecycle!=='archived'&&canPerformQuoteAction(a.quoteActor,'edit_draft')});}catch{return json({error:'Saved schedule is invalid; history preserved.'},422);}
}
export async function POST(request:Request,{params}:Context){
 const {workspaceId}=await params,a=await access(workspaceId,true);if(!a.ok)return a.response;
 let plan,version;
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>1800000)throw new Error('Schedule is too large.');const body=JSON.parse(raw);version=body.expectedVersion;if(!Number.isSafeInteger(version)||version<0||version>=2147483647)throw new Error('Invalid schedule revision.');plan=parseProductionPlan(body.document);}catch(e){return json({error:e instanceof Error?e.message:'Invalid schedule.'},400);}
 const result=await a.actorSupabase.from('lab_production_schedule_revisions').insert({workspace_id:workspaceId,revision:version+1,document:plan,created_by:a.actorId,created_by_email:a.actorEmail}).select('revision,document').single();
 if(result.error)return json({error:['PT409','23505'].includes(result.error.code)?'Schedule changed on another device. Your draft is retained; reload before saving.':'Schedule could not save; your draft is retained.'},['PT409','23505'].includes(result.error.code)?409:403);
 return json({version:result.data.revision,document:result.data.document},201);
}
