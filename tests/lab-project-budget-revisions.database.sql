\set ON_ERROR_STOP on
-- Run after the won/complete sync fixture and the budget migration in a disposable local DB.
do $$begin
 if current_database() not like 'mdp_lab_identity_test%' then raise exception 'Disposable fixture required';end if;
 if has_function_privilege('authenticated','public.lab_quote_budget_control(uuid,integer,boolean,uuid)','execute')
  or has_table_privilege('authenticated','public.lab_project_budget_revisions','insert') then
  raise exception 'Budget mutation exposed to browser role';
 end if;
end$$;
begin;
select public.lab_quote_budget_control('55555555-0000-4000-8000-000000000001',1,true,'88888888-0000-4000-8000-000000000001');
insert into public.quote_workbook_revisions(workspace_id,revision,document) values
 ('55555555-0000-4000-8000-000000000001',2,'{"schedule":{"status":"Closed won","projectStatus":"Active"},"salesperson":"Revised"}');
set local role service_role;
do $$
declare
 scope uuid:='55555555-0000-4000-8000-000000000001';
 actor uuid:='88888888-0000-4000-8000-000000000001';
 target text:='lab-'||scope::text;
 run uuid;
 event_id uuid;
 payload jsonb;
 candidate jsonb:='{"totals":{"price":200,"buildBudget":120,"hoursAllowed":5},"budgetHandoff":{"lines":[{"id":"wall","name":"Wall","type":"Fabrication","buildBudget":120,"hoursAllowed":5}]}}';
begin
 if (public.lab_quote_budget_control(scope)->>'pending')::boolean is distinct from true then
  raise exception 'Save cleared Pending';
 end if;
 begin
  perform public.lab_quote_budget_control(scope,1,false,actor);
  raise exception 'Stale release accepted';
 exception when sqlstate 'PT409' then null;
 end;

 -- A stale application payload is constructed as though the client had read an approved
 -- state. The transaction must honor the hold even when it receives proposed values.
 for pass in 1..3 loop
  event_id:=gen_random_uuid();
  run:=public.lab_claim_project_sync('manual');
  payload:=jsonb_build_object('workspaceId',scope,'expectedProjectId',target,'expectedJobNumber','500','revision',2,
   'document',(select document from public.quote_workbook_revisions where workspace_id=scope and revision=2),
   'identity','{"dealId":"5000","jobNumber":"500","name":"Canonical name","pm":"GM","closeDate":"2026-11-10","dueDate":"2026-12-01","hubspot":{"quotes":[]}}'::jsonb,
   'currentBudget',candidate,'activityId',event_id,'activityHash',repeat('b',64),'costingHash',repeat('c',64),
   'activity','{"capturedAt":"2026-11-27T12:00:00Z","project":{"id":"source-job","job_number":"500","hubspot_deal_id":"5000"},"labor":[]}'::jsonb,
   'costing',jsonb_build_object('activitySnapshotId',event_id,'activitySourceSha256',repeat('b',64),
    'sourceProjectId','source-job','jobNumber','500','dealId','5000','resolvedAt','2026-11-27T12:00:00Z',
    'rows','[]'::jsonb,'expected','{"missingHours":0}'::jsonb));
  payload:=jsonb_set(payload,'{activity,capturedAt}',to_jsonb('2026-11-27T12:00:00Z'::timestamptz + make_interval(secs=>pass)));
  perform public.lab_apply_project_sync(run,scope,payload);
  perform public.lab_finish_project_sync(run);
  if pass=1 then
   if exists(select 1 from public.lab_project_budget_revisions where project_id=target) then
    raise exception 'Pending budget applied';
   end if;
   perform public.lab_quote_budget_control(scope,2,false,actor);
  elsif (select count(*) from public.lab_project_budget_revisions where project_id=target)<>1 then
   raise exception 'Released budget missing or applied twice';
  end if;
 end loop;

 if (select workbook_revision from public.lab_project_quote_sources where project_id=target)<>1
   or (select snapshot#>>'{totals,price}' from public.lab_project_quote_sources where project_id=target)<>'100' then
  raise exception 'Original budget overwritten';
 end if;
 if (select budget#>>'{totals,price}' from public.lab_project_budget_revisions where project_id=target)<>'200' then
  raise exception 'Current budget not published';
 end if;
end$$;
rollback;
select 'PASS: durable hold, stale release rejected, approved apply, repeat safe, original retained' evidence;
