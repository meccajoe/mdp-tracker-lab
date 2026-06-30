-- Materials catalog foundation for MDP Tracker
-- Staging + canonical tables for spreadsheet cutover to app-managed source of truth.

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  category text not null,
  subcategory text,
  dimensions text,
  thickness_text text,
  base_unit text,
  default_vendor_id uuid references vendors(id) on delete set null,
  default_price numeric(12, 2),
  sku_or_code text,
  finish text,
  notes text,
  search_text text generated always as (
    btrim(
      coalesce(canonical_name, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(subcategory, '') || ' ' ||
      coalesce(dimensions, '') || ' ' ||
      coalesce(thickness_text, '') || ' ' ||
      coalesce(base_unit, '') || ' ' ||
      coalesce(sku_or_code, '') || ' ' ||
      coalesce(finish, '') || ' ' ||
      coalesce(notes, '')
    )
  ) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

create table if not exists vendor_aliases (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  alias_text text not null,
  normalized_alias_text text not null,
  source_type text check (source_type in ('spreadsheet', 'invoice', 'bill', 'manual')),
  created_at timestamptz not null default now()
);

create table if not exists material_aliases (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  alias_text text not null,
  normalized_alias_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists material_vendor_prices (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  vendor_sku text,
  vendor_material_name text,
  vendor_dimension_text text,
  unit text,
  pack_quantity numeric(12, 4),
  price numeric(12, 2) not null,
  price_basis text,
  effective_date date,
  source_type text not null check (source_type in ('spreadsheet', 'invoice', 'bill', 'manual')),
  source_ref text,
  is_current boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists material_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text,
  uploaded_by text,
  status text not null check (status in ('preview', 'committed', 'failed')),
  workbook_hash text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists material_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references material_import_batches(id) on delete cascade,
  sheet_name text not null,
  source_row_number integer not null,
  raw_row jsonb not null,
  parsed_row jsonb,
  normalized_candidate jsonb,
  status text not null check (status in ('parsed', 'needs_review', 'skipped', 'imported', 'error')),
  error_text text,
  created_at timestamptz not null default now()
);

create table if not exists material_change_log (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references materials(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  change_type text not null,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  changed_by text,
  changed_at timestamptz not null default now(),
  batch_id uuid references material_import_batches(id) on delete set null
);

create unique index if not exists vendor_aliases_normalized_alias_key
  on vendor_aliases (normalized_alias_text);

create unique index if not exists material_aliases_material_normalized_alias_key
  on material_aliases (material_id, normalized_alias_text);

create index if not exists materials_category_idx
  on materials (category);

create index if not exists materials_active_idx
  on materials (active);

create index if not exists materials_category_name_idx
  on materials (category, canonical_name);

create index if not exists materials_search_fts
  on materials using gin (to_tsvector('english', search_text));

create index if not exists material_vendor_prices_material_current_idx
  on material_vendor_prices (material_id, is_current);

create index if not exists material_vendor_prices_vendor_current_idx
  on material_vendor_prices (vendor_id, is_current);

create index if not exists material_vendor_prices_source_type_idx
  on material_vendor_prices (source_type);

create index if not exists material_import_rows_batch_status_idx
  on material_import_rows (batch_id, status);

create index if not exists material_change_log_material_changed_at_idx
  on material_change_log (material_id, changed_at desc);

alter table materials enable row level security;
alter table vendor_aliases enable row level security;
alter table material_aliases enable row level security;
alter table material_vendor_prices enable row level security;
alter table material_import_batches enable row level security;
alter table material_import_rows enable row level security;
alter table material_change_log enable row level security;

create policy "authenticated_read_materials"
  on materials for select
  to authenticated
  using (true);

create policy "authenticated_read_vendor_aliases"
  on vendor_aliases for select
  to authenticated
  using (true);

create policy "authenticated_read_material_aliases"
  on material_aliases for select
  to authenticated
  using (true);

create policy "authenticated_read_material_vendor_prices"
  on material_vendor_prices for select
  to authenticated
  using (true);

create policy "authenticated_read_material_import_batches"
  on material_import_batches for select
  to authenticated
  using (true);

create policy "authenticated_read_material_import_rows"
  on material_import_rows for select
  to authenticated
  using (true);

create policy "authenticated_read_material_change_log"
  on material_change_log for select
  to authenticated
  using (true);
