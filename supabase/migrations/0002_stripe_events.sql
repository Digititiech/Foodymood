create table if not exists public.stripe_events (
  id bigserial primary key,
  event_id text not null unique,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
