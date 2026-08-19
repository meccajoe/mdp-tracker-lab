-- User-role changes must flow through admin-verified server routes.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM anon, authenticated;
