-- Lab only. Keep selection concurrency and existing archive governance/audit.
begin;
create or replace function public.set_lab_capacity_version(p_workspace_id uuid,p_action text,p_target_id uuid,p_expected_version integer) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare source public.lab_capacity_quote_versions; destination uuid;
begin
 perform pg_advisory_xact_lock(610261200);
 select * into source from public.lab_capacity_quote_versions where workspace_id=p_workspace_id;
 if source.workspace_id is null or p_expected_version is null or source.version<>p_expected_version then raise exception 'Quote grouping changed. Reload and try again.' using errcode='PT409';end if;
 if p_action not in ('select','unselect','join','separate') then raise exception 'Invalid grouping action.' using errcode='22023';end if;
 destination:=source.group_id;
 if p_action='join' then select group_id into destination from public.lab_capacity_quote_versions where workspace_id=p_target_id;end if;
 if destination is null then raise exception 'Choose an existing project quote.' using errcode='22023';end if;
 if not exists(select 1 from public.ada_quote_workspaces where id=p_workspace_id and lifecycle_status<>'archived' and archived_at is null) then raise exception 'Restore the quote first.' using errcode='42501';end if;
 -- Changing a group affects every member's forecast; require edit access to all.
 if exists(select 1 from public.lab_capacity_quote_versions v where v.group_id in (source.group_id,destination) and not exists(select 1 from public.quote_workspace_members m where m.workspace_id=v.workspace_id and m.user_id=auth.uid() and m.email_normalized=public.current_quote_actor_email() and m.removed_at is null and m.workspace_role in ('owner','editor','reviewer'))) then raise exception 'Edit access to all related versions is required.' using errcode='42501';end if;
 update public.lab_capacity_quote_versions set version=version+1,modified_at=now() where group_id in (source.group_id,destination);
 if p_action='select' then
  update public.lab_capacity_quote_versions set selected=false where group_id=source.group_id;
  update public.lab_capacity_quote_versions set selected=true where workspace_id=p_workspace_id;
 elsif p_action='unselect' then
  update public.lab_capacity_quote_versions set selected=false where workspace_id=p_workspace_id;
 elsif p_action='join' and destination<>source.group_id then
  update public.lab_capacity_quote_versions set selected=false,group_id=destination where workspace_id=p_workspace_id;
 elsif p_action='separate' then
  update public.lab_capacity_quote_versions set group_id=gen_random_uuid(),selected=true where workspace_id=p_workspace_id;
 end if;
end;$$;

create or replace function public.lab_archive_closed_lost() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare w public.ada_quote_workspaces; actor_role text;
begin
 if coalesce(nullif(new.document->'planning'->>'status',''),new.document->'schedule'->>'status') <> 'Lost' then return new; end if;
 if coalesce(nullif(new.document->'planning'->>'status',''),new.document->'schedule'->>'status') is null then return new; end if;
 select * into w from public.ada_quote_workspaces where id=new.workspace_id for update;
 if w.lifecycle_status='archived' then return new; end if;
 select workspace_role into actor_role from public.quote_workspace_members where workspace_id=new.workspace_id and user_id=auth.uid() and email_normalized=public.current_quote_actor_email() and removed_at is null;
 perform public.append_quote_workflow_event(
  p_workspace_id=>new.workspace_id,p_revision_id=>null,p_event_type=>'workspace_archived',
  p_actor_email=>public.current_quote_actor_email(),p_actor_role=>actor_role,p_actor_capability=>'archive_workspace',
  p_expected_row_version=>w.row_version,p_resulting_state=>'archived',p_reason=>'Automatically archived: forecast Closed Lost',
  p_evidence_refs=>'[]'::jsonb,p_payload_json=>jsonb_build_object('previous_status',w.status,'workbook_revision',new.revision),
  p_idempotency_key=>'closed-lost-archive:'||new.workspace_id||':v'||w.row_version);
 return new;
end;$$;
revoke all on function public.lab_archive_closed_lost() from public,anon,authenticated,service_role;
create trigger lab_archive_closed_lost after insert on public.quote_workbook_revisions for each row execute function public.lab_archive_closed_lost();
notify pgrst,'reload schema';
commit;
