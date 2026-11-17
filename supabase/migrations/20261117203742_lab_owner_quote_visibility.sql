-- Restore the established Lab infrastructure-owner access, including future Paul-owned quotes.
-- Exact identities are verified in Lab gkvaeqlqrthztobxitvn; no RLS or user capability changes.
do $$ begin
 if not exists(select 1 from auth.users where id='7bac06cd-7b5c-4f4b-a52b-6266a63fd557' and email='joe@meccadesign.com')
 or not exists(select 1 from auth.users where id='96c13c65-ee9c-4d0d-bcad-a454b6e371ee' and email='paul@meccadesign.com')
 or not exists(select 1 from public.user_roles where email='joe@meccadesign.com' and role='admin') then
  raise exception 'Verified Lab owner identities required';
 end if;
end $$;
create or replace function lab_project_internal.ensure_lab_owner_quote_visibility() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.user_id='96c13c65-ee9c-4d0d-bcad-a454b6e371ee' and new.email_normalized='paul@meccadesign.com'
 and new.workspace_role='owner' and new.removed_at is null
 and exists(select 1 from public.ada_quote_workspaces where id=new.workspace_id and created_by_email='paul@meccadesign.com') then
  if not exists(select 1 from auth.users where id='7bac06cd-7b5c-4f4b-a52b-6266a63fd557' and email='joe@meccadesign.com')
  or not exists(select 1 from public.user_roles where email='joe@meccadesign.com' and role='admin') then
   raise exception 'Lab infrastructure owner identity changed';
  end if;
  -- Do not resurrect a deliberately removed grant or overwrite an existing membership.
  if not exists(select 1 from public.quote_workspace_members where workspace_id=new.workspace_id and (user_id='7bac06cd-7b5c-4f4b-a52b-6266a63fd557' or email_normalized='joe@meccadesign.com')) then
   insert into public.quote_workspace_members(workspace_id,user_id,email_normalized,workspace_role,added_by)
   values(new.workspace_id,'7bac06cd-7b5c-4f4b-a52b-6266a63fd557','joe@meccadesign.com','owner','lab-infrastructure-owner-visibility-20261117');
  end if;
 end if;
 return new;
end $$;
revoke all on function lab_project_internal.ensure_lab_owner_quote_visibility() from public,anon,authenticated,service_role;
drop trigger if exists lab_owner_quote_visibility on public.quote_workspace_members;
create trigger lab_owner_quote_visibility after insert on public.quote_workspace_members
for each row execute function lab_project_internal.ensure_lab_owner_quote_visibility();
insert into public.quote_workspace_members(workspace_id,user_id,email_normalized,workspace_role,added_by)
select w.id,'7bac06cd-7b5c-4f4b-a52b-6266a63fd557','joe@meccadesign.com','owner','lab-owner-visibility-backfill-20261117'
from public.ada_quote_workspaces w
where w.created_by_email='paul@meccadesign.com' and w.archived_at is null and w.status<>'archived'
 and exists(select 1 from public.quote_workspace_members m where m.workspace_id=w.id and m.user_id='96c13c65-ee9c-4d0d-bcad-a454b6e371ee' and m.email_normalized='paul@meccadesign.com' and m.workspace_role='owner' and m.removed_at is null)
 and not exists(select 1 from public.quote_workspace_members m where m.workspace_id=w.id and (m.email_normalized='joe@meccadesign.com' or m.user_id='7bac06cd-7b5c-4f4b-a52b-6266a63fd557'));
