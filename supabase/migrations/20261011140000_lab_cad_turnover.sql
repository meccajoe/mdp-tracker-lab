-- Tracker Lab gkvaeqlqrthztobxitvn only. Apply after 20261011120000_lab_quote_management.sql.
-- Append-only PDF snapshots; no existing quote or status is rewritten.
begin;
create table public.lab_cad_turnovers (
  workspace_id uuid not null references public.ada_quote_workspaces(id),
  status_version integer not null check(status_version>0),
  workbook_revision integer not null,
  pdf_base64 text not null check(length(pdf_base64) between 12 and 8000000),
  project_name text not null,
  client_name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,status_version),
  foreign key(workspace_id,workbook_revision) references public.quote_workbook_revisions(workspace_id,revision)
);
alter table public.lab_cad_turnovers enable row level security;
revoke all on public.lab_cad_turnovers from public,anon,authenticated,service_role;
grant select on public.lab_cad_turnovers to authenticated;
create policy cad_turnover_member_read on public.lab_cad_turnovers for select to authenticated using (
  exists(select 1 from public.quote_workspace_members m where m.workspace_id=lab_cad_turnovers.workspace_id
    and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null)
);

create function public.finalize_lab_quote_with_cad(
  p_workspace_id uuid,p_expected_version integer,p_expected_revision integer,
  p_pdf_base64 text,p_project_name text,p_client_name text
) returns public.lab_quote_controls
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare saved public.lab_quote_controls;workspace public.ada_quote_workspaces;pdf_bytes bytea;
begin
  if auth.uid() is null or public.current_quote_actor_email() not in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com') then
    raise exception 'Quote access required.' using errcode='42501';
  end if;
  -- Authorization and optimistic version checks happen in the existing status function.
  -- An invalid PDF or failed insert rolls that status change back in this transaction.
  saved:=public.set_lab_quote_status(p_workspace_id,'final',p_expected_version,p_expected_revision);
  select * into workspace from public.ada_quote_workspaces where id=p_workspace_id for share;
  if workspace.title is distinct from p_project_name or coalesce(workspace.client_name,'') is distinct from p_client_name then
    raise exception 'Project or client name changed. Reload the quote.' using errcode='PT409';
  end if;
  if p_pdf_base64 is null or length(p_pdf_base64)>8000000 or length(p_pdf_base64)<12 then
    raise exception 'A CAD Turnover PDF is required.' using errcode='22023';
  end if;
  pdf_bytes:=decode(p_pdf_base64,'base64');
  if substring(pdf_bytes from 1 for 5)<>convert_to('%PDF-','UTF8') then
    raise exception 'Invalid CAD Turnover PDF.' using errcode='22023';
  end if;
  insert into public.lab_cad_turnovers(workspace_id,status_version,workbook_revision,pdf_base64,project_name,client_name,created_by)
    values(p_workspace_id,saved.version,p_expected_revision,p_pdf_base64,p_project_name,p_client_name,auth.uid());
  return saved;
end;$$;
revoke all on function public.finalize_lab_quote_with_cad(uuid,integer,integer,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_lab_quote_with_cad(uuid,integer,integer,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
