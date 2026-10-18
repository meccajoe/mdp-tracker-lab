-- Tracker Lab gkvaeqlqrthztobxitvn only. Recoverable catalog removal; saved quotes untouched.
begin;
alter table public.lab_material_catalog add column deleted_at timestamptz;
create function public.lab_catalog_set_deleted(p_item_id uuid,p_expected_revision integer,p_deleted boolean)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare saved public.lab_material_catalog;
begin
 if not public.lab_catalog_writer() then raise exception 'Catalog write permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(610120100);
 update public.lab_material_catalog set deleted_at=case when p_deleted then now() else null end,revision=revision+1
 where item_id=p_item_id and revision=p_expected_revision returning * into saved;
 if not found then raise exception 'Catalog changed. Reload before saving.' using errcode='PT409';end if;
 return jsonb_build_object('entry',to_jsonb(saved));
end;$$;
revoke all on function public.lab_catalog_set_deleted(uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.lab_catalog_set_deleted(uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
