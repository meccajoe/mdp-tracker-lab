-- Joe explicitly approved seeing all Lab quotes, current and archived, Nov17.
-- Executed in gkvaeqlqrthztobxitvn only; added 10 owner memberships.
begin;
insert into public.quote_workspace_members(workspace_id,user_id,email_normalized,workspace_role,added_by)
select w.id,'7bac06cd-7b5c-4f4b-a52b-6266a63fd557','joe@meccadesign.com','owner','joe-all-quotes-approval-20261117'
from public.ada_quote_workspaces w
where w.created_by_email='paul@meccadesign.com' and (w.archived_at is not null or w.status='archived')
 and exists(select 1 from public.quote_workspace_members m where m.workspace_id=w.id and m.user_id='96c13c65-ee9c-4d0d-bcad-a454b6e371ee' and m.email_normalized='paul@meccadesign.com' and m.workspace_role='owner' and m.removed_at is null)
 and not exists(select 1 from public.quote_workspace_members m where m.workspace_id=w.id and (m.email_normalized='joe@meccadesign.com' or m.user_id='7bac06cd-7b5c-4f4b-a52b-6266a63fd557'));
select count(*) grants_added from public.quote_workspace_members where added_by='joe-all-quotes-approval-20261117';
commit;
