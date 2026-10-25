-- Lab only: supersedes the operational-date guard; preserves all saved revisions.
-- Explicit revised start is scheduling metadata, never commercial data.
begin;
create or replace function public.lab_quote_final_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare previous jsonb; previous_engine text; date_key text; date_value text;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text,27));
 if exists(select 1 from public.lab_quote_controls where workspace_id=new.workspace_id and quote_status='final') then
  select document,engine_version into previous,previous_engine from public.quote_workbook_revisions where workspace_id=new.workspace_id order by revision desc limit 1;
  if previous is null or new.engine_version is distinct from previous_engine
   or (new.document - 'schedule' - 'planning') is distinct from (previous - 'schedule' - 'planning')
   or ((new.document->'schedule') - 'status' - 'projectStatus' - 'projectStartOverride' - 'buildStart' - 'buildFinish' - 'dueDate' - 'shipDate' - 'installDate' - 'dismantleDate') is distinct from (coalesce(previous->'schedule','{"buildStart":"","buildFinish":"","installDate":"","status":""}'::jsonb) - 'status' - 'projectStatus' - 'projectStartOverride' - 'buildStart' - 'buildFinish' - 'dueDate' - 'shipDate' - 'installDate' - 'dismantleDate')
   or ((new.document->'planning') - 'status') is distinct from ((previous->'planning') - 'status')
   or coalesce(new.document->'schedule'->>'status','INVALID') not in ('','Not likely','Possible','Likely','Highly likely','Closed won','In production','Lost','Completed')
   or coalesce(new.document->'planning'->>'status','') not in ('','Not likely','Possible','Likely','Highly likely','Closed won','In production','Lost','Completed')
   or (new.document->'schedule' ? 'projectStatus' and coalesce(new.document->'schedule'->>'projectStatus','INVALID') not in ('Not Active','Active','Complete'))
  then raise exception 'Switch this quote to Draft before editing commercial data.' using errcode='PT409';end if;
  if coalesce(new.document->'schedule'->>'projectStartOverride','') <> '' and new.document->'schedule'->>'projectStartOverride' is distinct from new.document->'schedule'->>'buildStart' then raise exception 'Revised Project Start must match start.' using errcode='22023';end if;
  foreach date_key in array array['projectStartOverride','buildStart','buildFinish','dueDate','shipDate','installDate','dismantleDate'] loop
   date_value := new.document->'schedule'->>date_key;
   if date_value is not null and date_value <> '' then
    if date_value !~ '^\d{4}-\d{2}-\d{2}$' or date_value < '1900-01-01' or date_value > '2200-12-31' then
     raise exception 'Invalid scheduling date.' using errcode='22023';
    end if;
    if to_char(date_value::date,'YYYY-MM-DD') <> date_value then raise exception 'Invalid scheduling date.' using errcode='22023';end if;
   end if;
  end loop;
  if coalesce(new.document->'schedule'->>'buildStart','') <> '' and coalesce(new.document->'schedule'->>'buildFinish','') <> '' and new.document->'schedule'->>'buildFinish' < new.document->'schedule'->>'buildStart' then raise exception 'Build finish must follow build start.' using errcode='22023';end if;
 end if;
 return new;
end;$$;
notify pgrst,'reload schema';
commit;
