-- Run only in Tracker Lab after the timer correction migration. All test changes roll back.
begin;
-- Rollback-only regression against the disposable Takeoff test workspace.
update public.ada_quote_workspaces set lifecycle_status='draft',status='draft',archived_at=null where id='86ad5e17-0132-4aec-81d8-385e97edd557';
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users where email='paul@meccadesign.com'),'email','paul@meccadesign.com','role','authenticated')::text,true) is not null as actor_configured;
do $$ declare w uuid:='86ad5e17-0132-4aec-81d8-385e97edd557';r jsonb;n numeric;v integer; begin
 r:=public.lab_quote_time_correct(w);v:=(r->>'version')::integer;
 r:=public.lab_quote_time_correct(w,60000,v,'Rollback verification');
 if (r->>'totalMs')::numeric<>60000 then raise exception 'Correction failed';end if;
 if not (select paused from public.lab_quote_timer_state where workspace_id=w and actor_id=auth.uid()) then raise exception 'Not paused';end if;
 r:=public.lab_quote_time(w,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'start',clock_timestamp()-interval '2 minutes','end',clock_timestamp()-interval '90 seconds')));
 if (r->>'totalMs')::numeric<>60000 then raise exception 'Late pre-correction log revived time';end if;
 select total_ms into n from public.lab_quote_time_list(array[w]);if n<>60000 then raise exception 'List differs';end if;
 begin perform public.lab_quote_time_correct(w,0,v,'Stale');raise exception 'Stale correction accepted';exception when sqlstate 'PT409' then null;end;
 r:=public.lab_quote_time_correct(w,0,v+1,'Zero is allowed');if (r->>'totalMs')::numeric<>0 then raise exception 'Zero failed';end if;
 if jsonb_array_length(r->'history')<2 then raise exception 'History missing';end if;
 begin perform public.lab_quote_time_correct(w,-1,v+2,'Invalid');raise exception 'Negative accepted';exception when sqlstate '22023' then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000000000','email','paul@meccadesign.com','role','authenticated')::text,true);
 begin perform public.lab_quote_time_correct(w);raise exception 'Nonmember accepted';exception when sqlstate '42501' then null;end;
end $$;
select 'PASS: correction, pause, late logs, list parity, history, stale/negative/nonmember guards; all rolled back' as result;
rollback;
