-- Run after the rate migration in a disposable database. Never real payroll data.
begin;
insert into lab_project_internal.approved_hourly_rates(worker_id,canonical_name,allowed_names,hourly_rate,effective_start,approved_by,source_label,source_refs)
values(1,'Test Worker',array['Test Worker'],20,'0001-01-01','Test owner','Fixture',array['https://example.test/rate']);
do $$begin
 if has_function_privilege('anon','public.lab_project_rate_approvals()','execute') or has_function_privilege('authenticated','public.lab_project_rate_approvals()','execute') then raise exception 'Client RPC access';end if;
 if has_table_privilege('authenticated','lab_project_internal.approved_hourly_rates','select') or has_table_privilege('anon','lab_project_internal.approved_hourly_rates','select') then raise exception 'Client rate access';end if;
 if has_table_privilege('service_role','lab_project_internal.approved_hourly_rates','insert') or has_table_privilege('service_role','lab_project_internal.approved_hourly_rates','update') then raise exception 'Server can approve its own rates';end if;
 if (select prosecdef from pg_proc where oid='public.lab_project_rate_approvals()'::regprocedure) then raise exception 'Definer escalation';end if;
end$$;
set local role service_role;
do $$begin
 if jsonb_array_length(public.lab_project_rate_approvals())<>1 or public.lab_project_rate_approvals()->0->>'effectiveStart'<>'0001-01-01' then raise exception 'Server approval read failed';end if;
end$$;
reset role;
update lab_project_internal.approved_hourly_rates set revoked_at=now() where worker_id=1;
set local role service_role;
do $$begin if jsonb_array_length(public.lab_project_rate_approvals())<>0 then raise exception 'Revoked approval returned';end if;end$$;
rollback;
