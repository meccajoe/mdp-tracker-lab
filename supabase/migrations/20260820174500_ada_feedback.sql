create table if not exists public.ada_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.ada_quote_workspaces(id) on delete set null,
  submitted_by_email text not null,
  category text not null check (category in ('bug', 'idea', 'confusing', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  page_path text not null default '/ada',
  status text not null default 'new' check (status in ('new', 'triaged', 'planned', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ada_feedback_status_created_idx
  on public.ada_feedback(status, created_at desc);
create index if not exists ada_feedback_workspace_idx
  on public.ada_feedback(workspace_id, created_at desc)
  where workspace_id is not null;

alter table public.ada_feedback enable row level security;

create or replace function public.set_ada_feedback_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ada_feedback_updated_at on public.ada_feedback;
create trigger ada_feedback_updated_at
before update on public.ada_feedback
for each row execute function public.set_ada_feedback_updated_at();
