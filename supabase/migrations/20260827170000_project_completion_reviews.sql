create table if not exists public.project_completion_reviews (
  project_id text primary key references public.projects(id) on delete cascade,
  checklist jsonb not null default '{}'::jsonb,
  exception_notes jsonb not null default '{}'::jsonb,
  reviewed_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.project_completion_reviews enable row level security;

drop policy if exists "Authenticated users can read completion reviews" on public.project_completion_reviews;
create policy "Authenticated users can read completion reviews"
on public.project_completion_reviews for select
to authenticated
using (true);

create index if not exists project_completion_reviews_updated_at_idx
  on public.project_completion_reviews(updated_at desc);
