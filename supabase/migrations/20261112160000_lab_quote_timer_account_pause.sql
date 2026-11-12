-- Account-specific quote breaks; no workbook, pricing or revision changes.
begin;
create table public.lab_quote_timer_state (
 workspace_id uuid not null references public.ada_quote_workspaces(id),
 actor_id uuid not null references auth.users(id),
 paused boolean not null default false,
 version integer not null default 0,
 primary key(workspace_id,actor_id)
);
create table public.lab_quote_timer_breaks (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.ada_quote_workspaces(id),
 actor_id uuid not null references auth.users(id),
 started_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz,
 check(ended_at is null or ended_at>=started_at)
);
create index lab_quote_timer_break_lookup on public.lab_quote_timer_breaks(workspace_id,actor_id);
create unique index lab_quote_timer_one_break on public.lab_quote_timer_breaks(workspace_id,actor_id) where ended_at is null;
alter table public.lab_quote_timer_state enable row level security;
alter table public.lab_quote_timer_breaks enable row level security;
revoke all on public.lab_quote_timer_state,public.lab_quote_timer_breaks from public,anon,authenticated,service_role;
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
 -- Union overlapping intervals per person; different people's effort is additive.
 select coalesce(sum(extract(epoch from(upper(span)-lower(span)))*1000),0) into total_ms from
 (select actor_id,range_agg(tstzrange(s.started_at,s.ended_at,'[)')) - coalesce((select range_agg(tstzrange(b.started_at,b.ended_at,'[)')) from public.lab_quote_timer_breaks b where b.workspace_id=p_workspace_id and b.actor_id=s.actor_id),'{}'::tstzmultirange) as spans from public.lab_quote_time_spans s where s.workspace_id=p_workspace_id group by s.actor_id) people
 cross join lateral unnest(people.spans) span;
 return jsonb_build_object('totalMs',floor(total_ms),'paused',timer_state.paused,'pauseVersion',timer_state.version);
end $$;

create function public.lab_quote_time_sync(p_workspace_id uuid,p_spans jsonb default '[]',p_paused boolean default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; state public.lab_quote_timer_state;
begin
 -- Existing RPC validates identity/membership and holds the per-account state lock.
 result=public.lab_quote_time(p_workspace_id,p_spans);
 if p_paused is not null then
  if not exists(select 1 from public.quote_workspace_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer')) then raise exception 'Quote edit access required' using errcode='42501';end if;
  select * into state from public.lab_quote_timer_state where workspace_id=p_workspace_id and actor_id=auth.uid() for update;
  if state.paused is distinct from p_paused then
   if p_version is distinct from state.version then raise exception 'Timer changed on another device. Please retry.' using errcode='PT409';end if;
   if p_paused then
    insert into public.lab_quote_timer_breaks(workspace_id,actor_id) values(p_workspace_id,auth.uid());
   else
    update public.lab_quote_timer_breaks set ended_at=clock_timestamp() where workspace_id=p_workspace_id and actor_id=auth.uid() and ended_at is null;
   end if;
   update public.lab_quote_timer_state set paused=p_paused,version=version+1 where workspace_id=p_workspace_id and actor_id=auth.uid();
  end if;
  result=public.lab_quote_time(p_workspace_id,'[]');
 end if;
 return result;
end $$;
revoke all on function public.lab_quote_time_sync(uuid,jsonb,boolean,integer) from public,anon,service_role;
grant execute on function public.lab_quote_time_sync(uuid,jsonb,boolean,integer) to authenticated;
create or replace function public.lab_quote_time_totals(p_workspace_ids uuid[])
returns table(workspace_id uuid,total_ms numeric)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or public.current_quote_actor_email() not in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com') then raise exception 'Quote access required' using errcode='42501';end if;
 if coalesce(cardinality(p_workspace_ids),0)>100 then raise exception 'Too many quotes' using errcode='22023';end if;
 return query
 with allowed as (
  select distinct m.workspace_id from public.quote_workspace_members m
  where m.workspace_id=any(p_workspace_ids) and m.user_id=auth.uid()
   and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null
 ), people as (
  select s.workspace_id,s.actor_id,range_agg(tstzrange(s.started_at,s.ended_at,'[)')) - coalesce((select range_agg(tstzrange(b.started_at,b.ended_at,'[)')) from public.lab_quote_timer_breaks b where b.workspace_id=s.workspace_id and b.actor_id=s.actor_id),'{}'::tstzmultirange) as spans
  from public.lab_quote_time_spans s join allowed a on a.workspace_id=s.workspace_id
  group by s.workspace_id,s.actor_id
 ), totals as (
  select p.workspace_id,sum(extract(epoch from(upper(span)-lower(span)))*1000) as ms
  from people p cross join lateral unnest(p.spans) span group by p.workspace_id
 )
 select a.workspace_id,floor(coalesce(t.ms,0)) from allowed a left join totals t on t.workspace_id=a.workspace_id;
end $$;
revoke all on function public.lab_quote_time_totals(uuid[]) from public,anon,service_role;
grant execute on function public.lab_quote_time_totals(uuid[]) to authenticated;
commit;
