-- Lab: retain raw time logs; a correction sets a new shared total as of its timestamp.
begin;
create table public.lab_quote_time_corrections (
 workspace_id uuid not null references public.ada_quote_workspaces(id),
 version integer not null check(version>0),
 actor_id uuid not null references auth.users(id),
 corrected_at timestamptz not null,
 previous_ms numeric not null check(previous_ms>=0),
 total_ms bigint not null check(total_ms between 0 and 360000000000),
 reason text not null check(length(trim(reason)) between 1 and 500),
 primary key(workspace_id,version)
);
alter table public.lab_quote_time_corrections enable row level security;
revoke all on public.lab_quote_time_corrections from public,anon,authenticated,service_role;
create or replace function public.lab_quote_time_totals(p_workspace_ids uuid[])
returns table(workspace_id uuid,total_ms numeric)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or public.current_quote_actor_email() not in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com') then raise exception 'Quote access required' using errcode='42501';end if;
 if coalesce(cardinality(p_workspace_ids),0)>100 then raise exception 'Too many quotes' using errcode='22023';end if;
 return query
 with allowed as (
 select distinct m.workspace_id from public.quote_workspace_members m where m.workspace_id=any(p_workspace_ids) and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null
 ), baseline as (
 select a.workspace_id,c.corrected_at,coalesce(c.total_ms,0) as ms from allowed a left join lateral (select x.corrected_at,x.total_ms from public.lab_quote_time_corrections x where x.workspace_id=a.workspace_id order by x.version desc limit 1)c on true
 ), people as (
 select s.workspace_id,s.actor_id,range_agg(tstzrange(greatest(s.started_at,coalesce(a.corrected_at,'-infinity'::timestamptz)),s.ended_at,'[)')) - coalesce((select range_agg(tstzrange(b.started_at,b.ended_at,'[)')) from public.lab_quote_timer_breaks b where b.workspace_id=s.workspace_id and b.actor_id=s.actor_id),'{}'::tstzmultirange) as spans
 from public.lab_quote_time_spans s join baseline a on a.workspace_id=s.workspace_id where a.corrected_at is null or s.ended_at>a.corrected_at group by s.workspace_id,s.actor_id
 ), totals as (
 select p.workspace_id,sum(extract(epoch from(upper(span)-lower(span)))*1000) as ms from people p cross join lateral unnest(p.spans) span group by p.workspace_id
 ) select a.workspace_id,floor(a.ms+coalesce(t.ms,0)) from baseline a left join totals t on t.workspace_id=a.workspace_id;
end $$;
create or replace function public.lab_quote_time(p_workspace_id uuid,p_spans jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare role_name text; row_data jsonb; started timestamptz; ended timestamptz; total_ms numeric; final_at timestamptz; timer_state public.lab_quote_timer_state;
begin
 if auth.uid() is null or public.current_quote_actor_email() not in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com') then raise exception 'Quote access required' using errcode='42501';end if;
 select m.workspace_role into role_name from public.quote_workspace_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null;
 if role_name is null then raise exception 'Quote access required' using errcode='42501';end if;
 insert into public.lab_quote_timer_state(workspace_id,actor_id) values(p_workspace_id,auth.uid()) on conflict do nothing;
 select * into timer_state from public.lab_quote_timer_state where workspace_id=p_workspace_id and actor_id=auth.uid() for update;
 if jsonb_typeof(p_spans) is distinct from 'array' or jsonb_array_length(p_spans)>100 then raise exception 'Invalid time log' using errcode='22023';end if;
 select modified_at into final_at from public.lab_quote_controls where workspace_id=p_workspace_id and quote_status='final';
 if jsonb_array_length(p_spans)>0 then
  if role_name not in ('owner','editor','reviewer') then raise exception 'Quote edit access required' using errcode='42501';end if;
  for row_data in select value from jsonb_array_elements(p_spans) loop
   started=(row_data->>'start')::timestamptz;ended=(row_data->>'end')::timestamptz;
   if started is null or ended is null or ended<=started or ended-started>interval '60 seconds' or ended>now()+interval '60 seconds' then raise exception 'Invalid time interval' using errcode='22023';end if;
   if final_at is not null then ended=least(ended,final_at);end if;
   if ended<=started then continue;end if;
   insert into public.lab_quote_time_spans(id,workspace_id,actor_id,started_at,ended_at) values((row_data->>'id')::uuid,p_workspace_id,auth.uid(),started,ended) on conflict(id) do nothing;
  end loop;
 end if;
 select t.total_ms into total_ms from public.lab_quote_time_totals(array[p_workspace_id]) t;
 return jsonb_build_object('totalMs',floor(total_ms),'paused',timer_state.paused,'pauseVersion',timer_state.version);
end $$;
create function public.lab_quote_time_correct(p_workspace_id uuid,p_total_ms bigint default null,p_version integer default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version integer; current_total numeric; state_version integer; history jsonb; editable boolean;
begin
 -- Authoritative membership check occurs even for read-only metadata requests.
 select t.total_ms into current_total from public.lab_quote_time_totals(array[p_workspace_id]) t;
 if current_total is null then raise exception 'Quote access required' using errcode='42501';end if;
 select exists(select 1 from public.quote_workspace_members m join public.ada_quote_workspaces w on w.id=m.workspace_id where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer') and w.lifecycle_status<>'archived' and w.archived_at is null and w.status<>'archived') into editable;
 perform pg_advisory_xact_lock(hashtextextended('quote-time-correction:'||p_workspace_id::text,0));
 select coalesce(max(c.version),0) into current_version from public.lab_quote_time_corrections c where c.workspace_id=p_workspace_id;
 if p_total_ms is not null then
  if not editable then raise exception 'Quote edit access required' using errcode='42501';end if;
  if p_total_ms<0 or p_total_ms>360000000000 or p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'Invalid time correction' using errcode='22023';end if;
  if p_version is distinct from current_version then raise exception 'Time was corrected elsewhere. Reload before saving.' using errcode='PT409';end if;
  perform public.lab_quote_time(p_workspace_id,'[]');
  select version into state_version from public.lab_quote_timer_state where workspace_id=p_workspace_id and actor_id=auth.uid();
  perform public.lab_quote_time_sync(p_workspace_id,'[]',true,state_version);
  select t.total_ms into current_total from public.lab_quote_time_totals(array[p_workspace_id]) t;
  current_version:=current_version+1;
  insert into public.lab_quote_time_corrections values(p_workspace_id,current_version,auth.uid(),clock_timestamp(),current_total,p_total_ms,trim(p_reason));
  current_total:=p_total_ms;
 end if;
 select coalesce(jsonb_agg(row_to_json(h)),'[]'::jsonb) into history from (select c.version,c.corrected_at,c.previous_ms,c.total_ms,c.reason,coalesce(u.email,'Unknown user') as actor from public.lab_quote_time_corrections c left join auth.users u on u.id=c.actor_id where c.workspace_id=p_workspace_id order by c.version desc limit 10) h;
 return jsonb_build_object('totalMs',current_total,'version',current_version,'canCorrect',editable,'history',history);
end $$;
revoke all on function public.lab_quote_time_correct(uuid,bigint,integer,text) from public,anon,service_role;
grant execute on function public.lab_quote_time_correct(uuid,bigint,integer,text) to authenticated;
commit;
