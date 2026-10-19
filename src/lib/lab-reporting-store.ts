import type {SupabaseClient} from '@supabase/supabase-js';
import {parseQuoteV27} from './quote-v27-validation';
import {parseProductionPlan} from './production-plan';
import {reportingSettings,type ReportingSnapshot} from './lab-reporting';

/** Server-only repository. Fixed SELECTs, no caller-selected tables, SQL, RPCs or writes. */
export async function loadReportingSnapshot(db:SupabaseClient):Promise<ReportingSnapshot>{
 const [roster,latest,approved]=await Promise.all([
  db.from('lab_capacity_settings_revisions').select('revision,document').order('revision',{ascending:false}).limit(1).maybeSingle(),
  db.from('lab_team_schedule_revisions').select('revision,document,created_at').order('revision',{ascending:false}).limit(1).maybeSingle(),
  db.from('lab_team_schedule_revisions').select('revision,document,created_at').eq('status','approved').order('revision',{ascending:false}).limit(1).maybeSingle(),
 ]);
 if(roster.error||latest.error||approved.error)throw Error('Reporting sources unavailable.');
 const snapshot:ReportingSnapshot={settings:reportingSettings(roster.data?.document),rosterVersion:roster.data?.revision??0,quotes:[],plans:{},team:{latest:latest.data,approved:approved.data}};
 for(let offset=0;offset<=500;offset+=100){
  const rows=await db.from('ada_quote_workspaces').select('id,title,quote_workbook_revisions(revision,document),lab_production_schedule_revisions(revision,document)').neq('lifecycle_status','archived').is('archived_at',null).order('id').range(offset,offset+99)
   .order('revision',{referencedTable:'quote_workbook_revisions',ascending:false}).limit(1,{referencedTable:'quote_workbook_revisions'})
   .order('revision',{referencedTable:'lab_production_schedule_revisions',ascending:false}).limit(1,{referencedTable:'lab_production_schedule_revisions'});
  if(rows.error)throw Error('Reporting sources unavailable.');
  if(offset+(rows.data?.length??0)>500)throw Error('Reporting project limit exceeded.');
  for(const row of rows.data??[]){
   const q=row.quote_workbook_revisions[0],plan=row.lab_production_schedule_revisions[0];
   snapshot.plans[row.id]=plan?.revision??0;
   snapshot.quotes.push({workspaceId:row.id,workspace:row.title,version:q?.revision??0,document:q?parseQuoteV27(q.document):null,...(plan?{productionPlan:parseProductionPlan(plan.document)}:{})});
  }
  if((rows.data?.length??0)<100)return snapshot;
 }
 throw Error('Reporting project limit exceeded.');
}
