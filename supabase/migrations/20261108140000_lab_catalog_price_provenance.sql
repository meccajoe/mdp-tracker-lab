-- Tracker Lab gkvaeqlqrthztobxitvn only. Enrich existing audit documents atomically.
-- No saved quote or historical price is rewritten; legacy provenance stays unknown.
begin;
create or replace function public.lab_catalog_write_with_source(action text,payload jsonb,p_workspace_id uuid default null,p_source text default 'catalog')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; quote_name text;
begin
 if not public.lab_catalog_writer() then raise exception 'Catalog write permission required' using errcode='42501';end if;
 if action is null or p_source is null or action not in ('add','edit') or p_source not in ('catalog','takeoff') then raise exception 'Invalid catalog action or source';end if;
 if p_workspace_id is not null then
  if p_source<>'takeoff' then raise exception 'Invalid quote source';end if;
  select w.title into quote_name from public.ada_quote_workspaces w join public.quote_workspace_members m on m.workspace_id=w.id
   where w.id=p_workspace_id and w.lifecycle_status<>'archived' and m.user_id=auth.uid()
    and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer');
  if not found then raise exception 'Source quote edit access required' using errcode='42501';end if;
 end if;
 result=public.lab_catalog_write(action,payload);
 -- An add that found an existing row did not change it; never relabel its old history.
 if action='edit' or coalesce((result->>'created')::boolean,false) then
  update public.lab_material_catalog_history set document=document||jsonb_build_object('price_change_source',jsonb_build_object(
   'kind',p_source,'workspace_id',p_workspace_id,'quote_name',quote_name))
   where item_id=(result->'entry'->>'item_id')::uuid and revision=(result->'entry'->>'revision')::integer;
  if not found then raise exception 'Catalog audit record missing';end if;
 end if;
 return result;
end;$$;
revoke all on function public.lab_catalog_write_with_source(text,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.lab_catalog_write_with_source(text,jsonb,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
