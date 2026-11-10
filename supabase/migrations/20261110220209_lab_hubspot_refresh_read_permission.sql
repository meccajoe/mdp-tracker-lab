-- The server-only identity RPC reads quote-version membership as its caller.
-- Preserve SECURITY INVOKER and grant only the missing server read privilege.
grant select on public.lab_capacity_quote_versions to service_role;
