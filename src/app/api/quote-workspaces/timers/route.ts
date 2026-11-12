import {requireQuoteProductAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const actor=await requireQuoteProductAccess();if(!actor.ok)return actor.response;
 const ids=new URL(request.url).searchParams.get('ids')?.split(',')??[];
 if(!ids.length||ids.length>100||ids.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))return json({error:'Invalid quote IDs.'},400);
 const result=await actor.actorSupabase.rpc('lab_quote_time_list',{p_workspace_ids:ids});
 if(result.error)return json({error:'Timers could not refresh.'},503);
 return json({timers:result.data,actorId:actor.actorId});
}
