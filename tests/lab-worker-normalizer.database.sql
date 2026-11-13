\set ON_ERROR_STOP on
-- Disposable local database only; no source grants or functions are changed.
do $$begin if current_database() not like 'mdp_lab_identity_test%' then raise exception 'Disposable fixture required';end if;end$$;
create function public.normalize_labor_worker_name(worker_name text) returns text language sql immutable as $normalizer$
WITH cleaned AS (
    SELECT trim(regexp_replace(
      regexp_replace(lower(regexp_replace(COALESCE(worker_name, ''), '\([^)]*\)', ' ', 'g')), '[^a-z]', ' ', 'g'),
      '\s+', ' ', 'g'
    )) AS value
  )
  SELECT CASE value
    WHEN 'daniel guiterrez' THEN 'daniel gutierrez'
    WHEN 'cruz eduardo deleon' THEN 'eduardo c deleon'
    WHEN 'eliezar william sosa' THEN 'eliezer william salinas sosa'
    WHEN 'greg maslyk' THEN 'gregory maslyk'
    WHEN 'henry ledezma' THEN 'henry ledezma mireles'
    WHEN 'john chitwood' THEN 'john chittwood'
    WHEN 'jorge reyes' THEN 'jorge rodriguez reyes'
    WHEN 'jose dozal' THEN 'jose l dozal'
    WHEN 'josua datray' THEN 'joshua datray'
    WHEN 'juan gaucin' THEN 'juan a gaucin'
    WHEN 'roger davis' THEN 'roger d davis'
    WHEN 'jesse valeriano iii' THEN 'jesse valeriano'
    ELSE value
  END
  FROM cleaned;
$normalizer$;
create table public.normalizer_fixture(id integer generated always as identity,employee_name text,expected text);
insert into public.normalizer_fixture(employee_name) values
(null),(''),('Alan Escudero (1)'),('Benitez Robertino'),('Robertino Benitez'),('JOSÉ L. Dozal'),
('Daniel Guiterrez'),('Cruz Eduardo Deleon'),('Eliezar William Sosa'),('Greg Maslyk'),
('Henry Ledezma'),('John Chitwood'),('Jorge Reyes'),('Jose Dozal'),('Josua Datray'),
('Juan Gaucin'),('Roger Davis'),('Jesse Valeriano III'),('  Mixed   spacing  (deleted) '),('New Worker 42');
update public.normalizer_fixture set expected=public.normalize_labor_worker_name(employee_name);
do $$begin if not exists(select 1 from pg_roles where rolname='mdp_normalizer_reader') then create role mdp_normalizer_reader;end if;end$$;
revoke all on function public.normalize_labor_worker_name(text) from public,mdp_normalizer_reader;
grant usage on schema public to mdp_normalizer_reader;
grant select on public.normalizer_fixture to mdp_normalizer_reader;
set role mdp_normalizer_reader;
do $$begin
 begin perform public.normalize_labor_worker_name('Greg Maslyk');raise exception 'Fixture function must be denied';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.normalizer_fixture labor where (WITH cleaned AS (
    SELECT trim(regexp_replace(
      regexp_replace(lower(regexp_replace(COALESCE(labor.employee_name, ''), '\([^)]*\)', ' ', 'g')), '[^a-z]', ' ', 'g'),
      '\s+', ' ', 'g'
    )) AS value
  )
  SELECT CASE value
    WHEN 'daniel guiterrez' THEN 'daniel gutierrez'
    WHEN 'cruz eduardo deleon' THEN 'eduardo c deleon'
    WHEN 'eliezar william sosa' THEN 'eliezer william salinas sosa'
    WHEN 'greg maslyk' THEN 'gregory maslyk'
    WHEN 'henry ledezma' THEN 'henry ledezma mireles'
    WHEN 'john chitwood' THEN 'john chittwood'
    WHEN 'jorge reyes' THEN 'jorge rodriguez reyes'
    WHEN 'jose dozal' THEN 'jose l dozal'
    WHEN 'josua datray' THEN 'joshua datray'
    WHEN 'juan gaucin' THEN 'juan a gaucin'
    WHEN 'roger davis' THEN 'roger d davis'
    WHEN 'jesse valeriano iii' THEN 'jesse valeriano'
    ELSE value
  END
  FROM cleaned) is distinct from labor.expected) then raise exception 'Inline rules differ from approved source';end if;
 if (select expected from public.normalizer_fixture where employee_name='Benitez Robertino')=(select expected from public.normalizer_fixture where employee_name='Robertino Benitez') then raise exception 'Unapproved reversed-name match';end if;
end$$;
reset role;
select 'PASS: inline normalization matches 20 source cases while custom function EXECUTE is denied' evidence;
