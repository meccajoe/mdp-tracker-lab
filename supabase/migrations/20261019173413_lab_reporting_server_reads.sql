-- Tracker Lab gkvaeqlqrthztobxitvn only. Internal reporting server reads;
-- no bot receives this role/key, and public/authenticated grants are unchanged.
do $$
declare relation text;
begin
 foreach relation in array array['lab_capacity_settings_revisions','lab_production_schedule_revisions','lab_team_schedule_revisions'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=relation and c.relkind='r' and c.relrowsecurity) then
   raise exception 'Expected RLS-protected Lab planning table is missing: %', relation;
  end if;
 end loop;
end $$;

grant select on public.lab_capacity_settings_revisions,
 public.lab_production_schedule_revisions,
 public.lab_team_schedule_revisions to service_role;
