-- Tracker Lab only (gkvaeqlqrthztobxitvn). Does not alter saved quotes.
create table public.lab_material_catalog (
 item_id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 2000),
 unit text not null check(length(unit)<=200),
 unit_cost numeric check(unit_cost>=0 and unit_cost<=1e12),
 source text not null check(source in ('Google Sheet DB','Added from Takeoff')),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 updated_by uuid not null default auth.uid()
);
create unique index lab_material_catalog_name on public.lab_material_catalog(lower(regexp_replace(btrim(name),'\s+',' ','g')));
create table public.lab_material_catalog_history (
 item_id uuid not null, revision integer not null, document jsonb not null,
 primary key(item_id,revision)
);
create table public.lab_material_catalog_import (
 singleton boolean primary key default true check(singleton),
 imported_at timestamptz not null default now(),
 imported_count integer not null, warnings jsonb not null default '[]',
 imported_by uuid not null default auth.uid()
);
alter table public.lab_material_catalog enable row level security;
alter table public.lab_material_catalog_history enable row level security;
alter table public.lab_material_catalog_import enable row level security;
create function public.lab_catalog_reader() returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select auth.uid() is not null and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com');
$$;
create function public.lab_catalog_writer() returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select public.lab_catalog_reader() and exists(select 1 from public.quote_user_capabilities where capability='create_workspace' and revoked_at is null and email_normalized=public.current_quote_actor_email() and (user_id is null or user_id=auth.uid()));
$$;
revoke all on public.lab_material_catalog,public.lab_material_catalog_history,public.lab_material_catalog_import from public,anon,authenticated,service_role;
grant select,insert,update on public.lab_material_catalog to authenticated;
grant select on public.lab_material_catalog_history to authenticated;
grant select,insert on public.lab_material_catalog_import to authenticated;
create policy catalog_read on public.lab_material_catalog for select to authenticated using(public.lab_catalog_reader());
create policy catalog_add on public.lab_material_catalog for insert to authenticated with check(public.lab_catalog_writer() and updated_by=auth.uid());
create policy catalog_edit on public.lab_material_catalog for update to authenticated using(public.lab_catalog_writer()) with check(public.lab_catalog_writer() and updated_by=auth.uid());
create policy catalog_history_read on public.lab_material_catalog_history for select to authenticated using(public.lab_catalog_reader());
create policy catalog_import_read on public.lab_material_catalog_import for select to authenticated using(public.lab_catalog_reader());
create policy catalog_import_add on public.lab_material_catalog_import for insert to authenticated with check(public.lab_catalog_writer() and imported_by=auth.uid());
create function public.lab_catalog_audit() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.lab_catalog_writer() then raise exception 'Catalog write permission required' using errcode='42501';end if;
 if tg_op='INSERT' and new.revision<>1 then raise exception 'Invalid first revision';end if;
 if tg_op='UPDATE' then
  if new.item_id<>old.item_id or new.source<>old.source then raise exception 'Catalog identity and source cannot change';end if;
  if new.revision<>old.revision+1 then raise exception 'Catalog changed. Reload before saving.' using errcode='PT409';end if;
 end if;
 new.updated_at=now();new.updated_by=auth.uid();
 insert into public.lab_material_catalog_history values(new.item_id,new.revision,to_jsonb(new));return new;
end;$$;
create trigger catalog_audit before insert or update on public.lab_material_catalog for each row execute function public.lab_catalog_audit();
-- All writes serialize for atomic initialization, deduplication and optimistic edits.
create function public.lab_catalog_write(action text, payload jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare entry jsonb; saved public.lab_material_catalog; count_added integer=0;
begin
 if not public.lab_catalog_writer() then raise exception 'Catalog write permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(610120100);
 if action='import' then
  if exists(select 1 from public.lab_material_catalog_import) then return jsonb_build_object('alreadyImported',true);end if;
  if jsonb_typeof(payload->'materials')<>'array' or jsonb_array_length(payload->'materials') not between 1 and 2000 then raise exception 'Invalid import';end if;
  if exists(select 1 from public.lab_material_catalog) then raise exception 'Catalog already has entries; review before import' using errcode='PT409';end if;
  for entry in select * from jsonb_array_elements(payload->'materials') loop
   insert into public.lab_material_catalog(name,unit,unit_cost,source) values(btrim(entry->>'name'),entry->>'unit',(entry->>'unitCost')::numeric,'Google Sheet DB');
   count_added=count_added+1;
  end loop;
  insert into public.lab_material_catalog_import(imported_count,warnings) values(count_added,coalesce(payload->'warnings','[]'::jsonb));
  return jsonb_build_object('imported',count_added);
 end if;
 if not exists(select 1 from public.lab_material_catalog_import) then raise exception 'Import the Google Sheet catalog first' using errcode='PT409';end if;
 if action='add' then
  select * into saved from public.lab_material_catalog where lower(regexp_replace(btrim(name),'\s+',' ','g'))=lower(regexp_replace(btrim(payload->>'name'),'\s+',' ','g'));
  if found then return jsonb_build_object('entry',to_jsonb(saved),'created',false);end if;
  insert into public.lab_material_catalog(name,unit,unit_cost,source) values(btrim(payload->>'name'),payload->>'unit',(payload->>'unitCost')::numeric,'Added from Takeoff') returning * into saved;
 elsif action='edit' then
  update public.lab_material_catalog set name=btrim(payload->>'name'),unit=payload->>'unit',unit_cost=(payload->>'unitCost')::numeric,revision=revision+1 where item_id=(payload->>'itemId')::uuid and revision=(payload->>'expectedVersion')::integer returning * into saved;
  if not found then raise exception 'Catalog changed. Reload before saving.' using errcode='PT409';end if;
 else raise exception 'Unknown catalog action';end if;
 return jsonb_build_object('entry',to_jsonb(saved),'created',action='add');
end;$$;
revoke all on function public.lab_catalog_reader(),public.lab_catalog_writer(),public.lab_catalog_audit(),public.lab_catalog_write(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lab_catalog_reader(),public.lab_catalog_writer(),public.lab_catalog_write(text,jsonb) to authenticated;
