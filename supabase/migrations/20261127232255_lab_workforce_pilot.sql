-- Evidence is scoped to the Lab project and approved workbook. It never publishes to Workforce.
create table public.lab_workforce_handoff_evidence (
 project_id text primary key references public.lab_project_quote_sources(project_id),
 job_number text not null,
 deal_id text not null,
 jobcode_id bigint not null check (jobcode_id>0),
 workspace_id uuid not null,
 workbook_revision integer not null check (workbook_revision>0),
 activity_snapshot_id uuid not null references public.lab_project_activity_snapshots(id),
 captured_at timestamptz not null default clock_timestamp(),
 links jsonb not null check (jsonb_typeof(links)='array'),
 entries jsonb not null check (jsonb_typeof(entries)='array')
);
alter table public.lab_workforce_handoff_evidence enable row level security;
revoke all on public.lab_workforce_handoff_evidence from public,anon,authenticated,service_role;
grant select on public.lab_workforce_handoff_evidence to authenticated;
grant select,insert on public.lab_workforce_handoff_evidence to service_role;
create policy lab_workforce_handoff_evidence_read on public.lab_workforce_handoff_evidence for select to authenticated
 using (exists (select 1 from public.lab_project_quote_sources s where s.project_id=lab_workforce_handoff_evidence.project_id));

create function public.save_lab_workforce_pilot(
 p_project text,p_job text,p_deal text,p_jobcode bigint,p_workspace uuid,p_revision integer,
 p_snapshot uuid,p_links jsonb,p_entries jsonb
) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare activity jsonb; candidates jsonb; budget_workspace uuid; budget_revision integer;
begin
 if jsonb_typeof(p_links) is distinct from 'array' or jsonb_typeof(p_entries) is distinct from 'array'
  or jsonb_array_length(p_links) not between 1 and 200 or jsonb_array_length(p_entries) not between 1 and 2000 then
  raise exception 'Invalid Workforce evidence';
 end if;
 perform id from public.projects where id=p_project and status='Active' and job_number=p_job and hubspot_deal_id=p_deal for share;
 if not found then raise exception 'Project identity changed';end if;
 select workspace_id,workbook_revision,budget#>'{budgetHandoff,workforceCandidates}'
 into budget_workspace,budget_revision,candidates
 from public.lab_project_budget_revisions where project_id=p_project order by id desc limit 1;
 if not found then
  select workspace_id,workbook_revision,snapshot#>'{budgetHandoff,workforceCandidates}'
  into budget_workspace,budget_revision,candidates from public.lab_project_quote_sources where project_id=p_project;
 end if;
 if budget_workspace is distinct from p_workspace or budget_revision is distinct from p_revision then
  raise exception 'Approved quote revision changed';
 end if;
 select snapshot into activity from public.lab_project_activity_snapshots
 where id=p_snapshot and project_id=p_project and job_number=p_job and hubspot_deal_id=p_deal;
 if not found then raise exception 'Activity evidence belongs to a different project';end if;
 if exists(select 1 from jsonb_array_elements(p_links) l
   where coalesce(l->>'packageId','')='' or coalesce(l->>'workforceItemId','') !~ '^[1-9][0-9]*$'
   or not exists(select 1 from jsonb_array_elements(candidates) c where c->>'quoteLineId'=l->>'quoteLineId'))
   or (select count(distinct l->>'quoteLineId') from jsonb_array_elements(p_links) l)<>jsonb_array_length(p_links)
   or (select count(distinct l->>'packageId') from jsonb_array_elements(p_links) l)<>jsonb_array_length(p_links)
   or (select count(distinct l->>'workforceItemId') from jsonb_array_elements(p_links) l)<>jsonb_array_length(p_links) then
  raise exception 'Invalid or duplicate build item mapping';
 end if;
 if (select count(distinct e->>'id') from jsonb_array_elements(p_entries) e)<>jsonb_array_length(p_entries)
  or exists(select 1 from jsonb_array_elements(p_entries) e
   where e->>'kind' is null or e->>'kind' not in ('item','group','service')
   or coalesce(e->>'label','')='' or coalesce(e->>'packageId','')=''
   or (e->>'kind'='item' and not exists(select 1 from jsonb_array_elements(p_links) l where l->>'packageId'=e->>'packageId'))
   or not exists(select 1 from jsonb_array_elements(activity->'labor') a
    where a->>'qbo_entry_id'=e->>'id' and (a->>'reg_hours')::numeric+(a->>'ot_hours')::numeric=(e->>'hours')::numeric)) then
   raise exception 'Time entry evidence does not match Lab activity';
 end if;
 insert into public.lab_workforce_handoff_evidence(project_id,job_number,deal_id,jobcode_id,workspace_id,
  workbook_revision,activity_snapshot_id,links,entries)
 values(p_project,p_job,p_deal,p_jobcode,p_workspace,p_revision,p_snapshot,p_links,p_entries);
end $$;
revoke all on function public.save_lab_workforce_pilot(text,text,text,bigint,uuid,integer,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_lab_workforce_pilot(text,text,text,bigint,uuid,integer,uuid,jsonb,jsonb) to service_role;
