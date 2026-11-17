-- Existing daily reads need identity/status, not every quote's catalog/takeoffs.
create function public.lab_project_sync_scope_v2() returns jsonb
language sql security invoker set search_path=pg_catalog,public as $$
with heads as (
 select distinct on(v.group_id) v.group_id,w.id workspace_id,w.title,w.client_name,w.hubspot_deal_id,w.job_number,w.created_at
 from public.lab_capacity_quote_versions v join public.ada_quote_workspaces w on w.id=v.workspace_id
 where w.archived_at is null and w.lifecycle_status<>'archived'
 order by v.group_id,w.created_at desc,v.selected desc,w.id
),scope as (
 select h.*,r.revision,jsonb_strip_nulls(jsonb_build_object('schedule',r.document->'schedule','planning',r.document->'planning')) document,
 s.project_id,p.hubspot_deal_id linked_deal_id,p.job_number linked_job_number
 from heads h join lateral(select revision,document from public.quote_workbook_revisions where workspace_id=h.workspace_id order by revision desc limit 1)r on true
 left join lateral(select s.project_id from public.lab_project_quote_sources s join public.lab_capacity_quote_versions v on v.workspace_id=s.workspace_id where v.group_id=h.group_id)s on true
 left join public.projects p on p.id=s.project_id
)
select coalesce(jsonb_agg(to_jsonb(scope) order by scope.group_id),'[]'::jsonb) from scope
where project_id is not null or coalesce(nullif(document->'planning'->>'status',''),document->'schedule'->>'status','') in ('In production','Completed')
 or (coalesce(nullif(document->'planning'->>'status',''),document->'schedule'->>'status','')='Closed won' and coalesce(nullif(document->'schedule'->>'projectStatus',''),'Active') in ('Active','Complete'))
$$;
create function public.lab_project_sync_document(p_workspace uuid,p_revision integer) returns jsonb
language sql security invoker set search_path=pg_catalog,public as $$
 select r.document from public.quote_workbook_revisions r join public.ada_quote_workspaces w on w.id=r.workspace_id
 where r.workspace_id=p_workspace and r.revision=p_revision and w.archived_at is null and w.lifecycle_status<>'archived'
 and r.revision=(select max(revision) from public.quote_workbook_revisions where workspace_id=p_workspace)
$$;
revoke all on function public.lab_project_sync_scope_v2(),public.lab_project_sync_document(uuid,integer) from public,anon,authenticated;
grant execute on function public.lab_project_sync_scope_v2(),public.lab_project_sync_document(uuid,integer) to service_role;
