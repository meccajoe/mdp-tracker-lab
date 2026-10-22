-- Lab only: independently editable project status; no saved quote rewrites.
begin;
create or replace function public.lab_quote_final_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare previous jsonb; previous_engine text;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text,27));
 if exists(select 1 from public.lab_quote_controls where workspace_id=new.workspace_id and quote_status='final') then
  select document,engine_version into previous,previous_engine from public.quote_workbook_revisions where workspace_id=new.workspace_id order by revision desc limit 1;
  if previous is null or new.engine_version is distinct from previous_engine
   or (new.document - 'schedule' - 'planning') is distinct from (previous - 'schedule' - 'planning')
   or ((new.document->'schedule') - 'status' - 'projectStatus') is distinct from (coalesce(previous->'schedule','{"buildStart":"","buildFinish":"","installDate":"","status":""}'::jsonb) - 'status' - 'projectStatus')
   or ((new.document->'planning') - 'status') is distinct from ((previous->'planning') - 'status')
   or coalesce(new.document->'schedule'->>'status','INVALID') not in ('','Not likely','Possible','Likely','Highly likely','Closed won','In production','Lost','Completed')
   or coalesce(new.document->'planning'->>'status','') not in ('','Not likely','Possible','Likely','Highly likely','Closed won','In production','Lost','Completed')
   or (new.document->'schedule' ? 'projectStatus' and coalesce(new.document->'schedule'->>'projectStatus','INVALID') not in ('Not Active','Active','Complete'))
  then raise exception 'Switch this quote to Draft before editing commercial data.' using errcode='PT409';end if;
 end if;
 return new;
end;$$;
notify pgrst,'reload schema';
commit;
