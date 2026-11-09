-- Tracker Lab gkvaeqlqrthztobxitvn only. Isolated personal what-if scenarios.
begin;
create table public.lab_capacity_scenarios (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 version integer not null default 1 check(version>0),
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=200000),
 updated_at timestamptz not null default now()
);
alter table public.lab_capacity_scenarios enable row level security;
revoke all on public.lab_capacity_scenarios from public,anon,authenticated,service_role;
grant select,insert,update on public.lab_capacity_scenarios to authenticated;
create policy own_scenarios on public.lab_capacity_scenarios for all to authenticated
 using(owner_id=auth.uid() and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com'))
 with check(owner_id=auth.uid() and public.current_quote_actor_email() in ('paul@meccadesign.com','joe@meccadesign.com','mecca.joe@gmail.com'));
create index lab_capacity_scenarios_owner on public.lab_capacity_scenarios(owner_id,updated_at desc);
commit;
