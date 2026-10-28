import {loadActivationDates} from '@/lib/project-activation-server';
import {requireQuoteProductAccess} from '@/lib/ada-server';
import {parseProductionPlan} from '@/lib/production-plan';
export const dynamic='force-dynamic';
export async function GET(){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return Response.json({error:'Lab only.'},{status:403});
 const a=await requireQuoteProductAccess();if(!a.ok)return a.response;
 const plans:Record<string,ReturnType<typeof parseProductionPlan>>=Object.create(null);
 for(let offset=0;;offset+=200){const r=await a.actorSupabase.from('lab_production_schedule_revisions').select('workspace_id,revision,document').order('workspace_id').order('revision',{ascending:false}).range(offset,offset+199);
 if(r.error)return Response.json({error:'Saved production schedules unavailable. Automatic proposals are shown.',plans:{}},{status:503});
 try{for(const row of r.data??[])if(!Object.hasOwn(plans,row.workspace_id))plans[row.workspace_id]=parseProductionPlan(row.document);}catch{return Response.json({error:'A saved schedule is invalid. Review before planning.',plans:{}},{status:422});}
 if((r.data?.length??0)<200)break;
 }
 let activations;try{activations=await loadActivationDates(a.actorSupabase);}catch{return Response.json({error:'Project activation history could not load. Retry loading schedules; saved quotes are unchanged.',plans:{}},{status:503});}
 return Response.json({plans,activations},{headers:{'Cache-Control':'private, no-store'}});
}
