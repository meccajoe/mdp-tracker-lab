-- Lab only: independent, append-only quoting time; no quote snapshot changes.
begin;
create table public.lab_quote_time_spans (
 id uuid primary key,
 workspace_id uuid not null references public.ada_quote_workspaces(id),
 actor_id uuid not null references auth.users(id),
 started_at timestamptz not null,
 ended_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 check(ended_at>started_at and ended_at-started_at<=interval '60 seconds')
);
create index lab_quote_time_workspace_actor on public.lab_quote_time_spans(workspace_id,actor_id,started_at);
alter table public.lab_quote_time_spans enable row level security;
revoke all on public.lab_quote_time_spans from public,anon,authenticated,service_role;
-- All access passes through the narrow actor-checked RPC; rows are immutable.
create function public.lab_quote_time(p_workspace_id uuid,p_spans jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare role_name text; row_data jsonb; started timestamptz; ended timestamptz; total_ms numeric; final_at timestamptz;
begin
 if auth.uid() is null or public.current_quote_actor_email() not in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com') then raise exception 'Quote access required' using errcode='42501';end if;
 select m.workspace_role into role_name from public.quote_workspace_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null;
 if role_name is null then raise exception 'Quote access required' using errcode='42501';end if;
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
 (select actor_id,range_agg(tstzrange(started_at,ended_at,'[)')) as spans from public.lab_quote_time_spans where workspace_id=p_workspace_id group by actor_id) people
 cross join lateral unnest(people.spans) span;
 return jsonb_build_object('totalMs',floor(total_ms));
end $$;
revoke all on function public.lab_quote_time(uuid,jsonb) from public,anon,service_role;
grant execute on function public.lab_quote_time(uuid,jsonb) to authenticated;
commit;
