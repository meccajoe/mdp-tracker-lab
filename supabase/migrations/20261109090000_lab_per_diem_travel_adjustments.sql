-- Lab only. Payment adjustments are versioned separately from quote prices.
begin;
alter table public.lab_per_diem_recipient_revisions
 add column travel_adjustments jsonb not null default '{}'::jsonb
 check(jsonb_typeof(travel_adjustments)='object' and octet_length(travel_adjustments::text)<=3000);
-- Existing append-only RLS, actor/timestamp and optimistic version apply unchanged.
commit;
