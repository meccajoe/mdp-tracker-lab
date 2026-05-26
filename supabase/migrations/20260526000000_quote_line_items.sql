-- quote_line_items: line items from HubSpot quotes and QBO invoices
-- Powers the /line-item-search page

create table if not exists quote_line_items (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('hubspot', 'qbo')),
  source_id       text not null,           -- HubSpot quote ID or QBO invoice ID
  source_ref      text,                    -- quote number or invoice number (job number or invoice #)
  source_date     date,                    -- quote/invoice date
  project_id      text references projects(id) on delete set null,
  project_name    text,                    -- denormalized for search (from project or deal name)
  sku             text,
  description     text,                    -- line item description / product name
  unit_cost       numeric(12, 2),
  quantity        numeric(12, 4),
  line_total      numeric(12, 2),
  vendor          text,                    -- vendor name (QBO only typically)
  -- Stable unique key per line: source + source_id + SKU + truncated description
  -- Set by the sync code so we can upsert without expression-index issues
  line_key        text not null,
  raw_text        text generated always as (
    coalesce(sku, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(project_name, '') || ' ' ||
    coalesce(vendor, '') || ' ' ||
    coalesce(source_ref, '')
  ) stored,
  synced_at       timestamptz not null default now()
);

-- Unique constraint: one row per source + source_id + line_key
-- line_key is set by sync code as: source_id + '|' + sku + '|' + md5(description)
create unique index if not exists quote_line_items_upsert_key
  on quote_line_items (source, source_id, line_key);

-- Full-text search index on raw_text using tsvector
create index if not exists quote_line_items_fts
  on quote_line_items using gin (to_tsvector('english', raw_text));

-- Indexes for sidebar filters
create index if not exists quote_line_items_source_date on quote_line_items (source_date);
create index if not exists quote_line_items_project_id on quote_line_items (project_id);
create index if not exists quote_line_items_source on quote_line_items (source);

-- RLS: authenticated users can read; service role handles writes
alter table quote_line_items enable row level security;

create policy "authenticated_read_quote_line_items"
  on quote_line_items for select
  to authenticated
  using (true);
