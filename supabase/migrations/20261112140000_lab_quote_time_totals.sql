-- Read-only bulk totals for quote lists. Same membership scope as the quote timer.
begin;
create function public.lab_quote_time_totals(p_workspace_ids uuid[])
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
  select s.workspace_id,s.actor_id,range_agg(tstzrange(s.started_at,s.ended_at,'[)')) as spans
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
