alter table public.meals add column if not exists updated_at timestamptz not null default now();
alter table public.plans add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.delivery_zones add column if not exists updated_at timestamptz not null default now();
