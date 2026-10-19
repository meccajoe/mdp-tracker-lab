import type {SupabaseClient} from '@supabase/supabase-js';
import {parseCapacity,type CapacityQuote} from './capacity';
import {parseQuoteV27} from './quote-v27-validation';
import {parseProductionPlan} from './production-plan';
export async function teamSources(db:SupabaseClient){
 const roster=await db.from('lab_capacity_settings_revisions').select('revision,document').order('revision',{ascending:false}).limit(1).maybeSingle();
 if(roster.error||!roster.data)throw Error('Saved roster unavailable. Save Roster & Settings first.');
 const quotes:CapacityQuote[]=[],sources:{id:string;quote:number;plan:number}[]=[];
 for(let offset=0;;offset+=100){
  const r=await db.from('ada_quote_workspaces').select('id,title').neq('lifecycle_status','archived').is('archived_at',null).order('id').range(offset,offset+99);
  if(r.error)throw Error('Project list unavailable; no partial team schedule was generated.');
  for(const w of r.data??[]){
   const [q,p]=await Promise.all([db.from('quote_workbook_revisions').select('revision,document').eq('workspace_id',w.id).order('revision',{ascending:false}).limit(1).maybeSingle(),db.from('lab_production_schedule_revisions').select('revision,document').eq('workspace_id',w.id).order('revision',{ascending:false}).limit(1).maybeSingle()]);
   if(q.error||p.error)throw Error(`${w.title}: saved data unavailable. Retry before planning.`);
   sources.push({id:w.id,quote:q.data?.revision??0,plan:p.data?.revision??0});
   if(q.data)quotes.push({workspaceId:w.id,workspace:w.title,version:q.data.revision,document:parseQuoteV27(q.data.document),productionPlan:p.data?parseProductionPlan(p.data.document):undefined});
  }
  if((r.data?.length??0)<100)break;
 }
 return {quotes,roster:parseCapacity(roster.data.document).settings.roster,sources:{roster:roster.data.revision,quotes:sources}};
}
