-- Project Pricing Intelligence v1
-- Read-only HubSpot-backed quote index for Ada and future Tracker UI consumers.

CREATE OR REPLACE VIEW public.project_pricing_index AS
SELECT
  p.id,
  p.name,
  p.client,
  p.project_type,
  p.close_date,
  p.due_date,
  p.contract_amount,
  p.status,
  p.pm,
  p.hubspot_deal_id,
  p.hubspot_deal_url,
  p.quote_labor,
  p.quote_materials,
  p.quote_design,
  p.quote_pm,
  p.quote_shipping,
  p.quote_crating,
  p.quote_id_labor,
  p.quote_travel,
  p.quote_storage,
  p.quote_props,
  p.quote_equipment,
  p.quote_rental,
  p.quote_flooring,
  p.budget_hrs,
  p.budget_materials,
  p.budget_design,
  p.budget_pm,
  p.budget_shipping,
  p.budget_crating,
  p.budget_id_labor,
  p.budget_travel,
  p.budget_storage,
  p.budget_props,
  p.budget_equipment,
  p.budget_rental,
  p.budget_flooring,
  p.total_spent,
  p.qbo_total_hours,
  p.qbo_labor_cost,
  CASE
    WHEN p.contract_amount > 0 AND p.quote_materials IS NOT NULL
      THEN ROUND((p.quote_materials / p.contract_amount) * 100, 1)
    ELSE NULL
  END AS quote_materials_pct_of_contract,
  CASE
    WHEN p.contract_amount > 0 AND p.total_spent IS NOT NULL
      THEN ROUND((p.total_spent / p.contract_amount) * 100, 1)
    ELSE NULL
  END AS actual_spend_pct_of_contract
FROM public.projects p
WHERE p.hubspot_deal_id IS NOT NULL
  AND p.quote_materials IS NOT NULL;
