-- Account timer controls and short-lived quote-page presence; no workbook writes.
begin;
create table public.lab_quote_timer_presence (
 workspace_id uuid not null references public.ada_quote_workspaces(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 seen_at timestamptz not null default clock_timestamp(),
 is_open boolean not null,
 primary key(workspace_id,actor_id,session_id)
);
alter table public.lab_quote_timer_presence enable row level security;
revoke all on public.lab_quote_timer_presence from public,anon,authenticated,service_role;
create function public.lab_quote_time_presence(p_workspace_id uuid,p_spans jsonb,p_paused boolean,p_version integer,p_session_id uuid,p_open boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.lab_quote_time_sync(p_workspace_id,p_spans,p_paused,p_version);
 if p_session_id is not null then
  insert into public.lab_quote_timer_presence(workspace_id,actor_id,session_id,is_open)
  values(p_workspace_id,auth.uid(),p_session_id,coalesce(p_open,false))
  on conflict(workspace_id,actor_id,session_id) do update set seen_at=clock_timestamp(),is_open=excluded.is_open;
  delete from public.lab_quote_timer_presence where actor_id=auth.uid() and seen_at<now()-interval '1 day';
 end if;
 return result;
end $$;
revoke all on function public.lab_quote_time_presence(uuid,jsonb,boolean,integer,uuid,boolean) from public,anon,service_role;
grant execute on function public.lab_quote_time_presence(uuid,jsonb,boolean,integer,uuid,boolean) to authenticated;
create function public.lab_quote_time_list(p_workspace_ids uuid[])
returns table(workspace_id uuid,total_ms numeric,paused boolean,pause_version integer,running boolean,can_toggle boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select t.workspace_id,t.total_ms,coalesce(s.paused,false),coalesce(s.version,0),
  not coalesce(s.paused,false) and coalesce(c.quote_status,'draft')='draft' and w.status<>'archived'
   and exists(select 1 from public.lab_quote_timer_presence p where p.workspace_id=t.workspace_id and p.actor_id=auth.uid() and p.is_open and p.seen_at>now()-interval '45 seconds'),
  coalesce(c.quote_status,'draft')='draft' and w.status<>'archived' and exists(select 1 from public.quote_workspace_members m where m.workspace_id=t.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer'))
 from public.lab_quote_time_totals(p_workspace_ids) t
 join public.ada_quote_workspaces w on w.id=t.workspace_id
 left join public.lab_quote_timer_state s on s.workspace_id=t.workspace_id and s.actor_id=auth.uid()
 left join public.lab_quote_controls c on c.workspace_id=t.workspace_id;
$$;
revoke all on function public.lab_quote_time_list(uuid[]) from public,anon,service_role;
grant execute on function public.lab_quote_time_list(uuid[]) to authenticated;
commit;
