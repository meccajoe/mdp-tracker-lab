import type {SupabaseClient} from '@supabase/supabase-js';
export async function capacityVersions(db:SupabaseClient){
 const rows:{workspace_id:string;group_id:string;selected:boolean;version:number}[]=[];
 for(let offset=0;;offset+=1000){const r=await db.from('lab_capacity_quote_versions').select('workspace_id,group_id,selected,version').order('workspace_id').range(offset,offset+999);if(r.error)throw Error('Capacity quote versions could not load. Apply the lab version-grouping update before forecasting.');rows.push(...r.data);if(r.data.length<1000)break;}
 return new Map(rows.map(r=>[r.workspace_id,r]));
}
