import {requireQuoteProductAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
export const dynamic='force-dynamic';
export async function GET(){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const actor=await requireQuoteProductAccess();if(!actor.ok)return actor.response;
 const result=await actor.actorSupabase.from('lab_capacity_settings_revisions').select('document').order('revision',{ascending:false}).limit(1).maybeSingle();
 if(result.error)return json({error:'Roster suggestions are unavailable. You can still type a name.'},503);
 const roster=result.data?.document?.settings?.roster??[];
 return json({names:[...new Set<string>(roster.filter((p:{active:boolean;name:unknown})=>p.active&&typeof p.name==='string'&&p.name.trim()).map((p:{name:string})=>p.name.trim()))].sort()});
}
