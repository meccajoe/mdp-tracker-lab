-- Lab-only hardening; apply after the verified bootstrap and hosted corrections.
ALTER VIEW public.project_summary SET (security_invoker = true);
ALTER VIEW public.project_pricing_index SET (security_invoker = true);
ALTER FUNCTION public.generate_expense_id() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_quote_transition_allowed(text,text,text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.normalize_labor_worker_name(text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_admin() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.quote_deterministic_uuid(text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.required_quote_capability(text) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.prevent_labor_worker_cost_policy_mutation() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.prevent_labor_rate_authority_mutation() SET search_path = pg_catalog, public, pg_temp;
