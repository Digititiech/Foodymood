create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type subscription_status as enum (
      'active',
      'trialing',
      'past_due',
      'incomplete',
      'canceled',
      'expired'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'pending',
      'paid',
      'preparing',
      'ready',
      'out_for_delivery',
      'delivered',
      'canceled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'delivery_type') then
    create type delivery_type as enum ('pickup', 'delivery');
  end if;
end
$$;

create or replace function public.validate_order_subscription()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.subscriptions s
    where s.id = new.subscription_id
      and s.user_id = new.user_id
      and s.status = 'active'
      and s.current_period_end > now()
  ) then
    raise exception 'Subscription does not belong to user, is inactive, or is expired';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_validate_order_subscription') then
    create trigger trg_validate_order_subscription
    before insert or update of subscription_id, user_id on public.orders
    for each row execute function public.validate_order_subscription();
  end if;
end
$$;

create or replace function public.create_order_atomic(
  p_user_id uuid,
  p_subscription_id uuid,
  p_delivery_type delivery_type,
  p_zip_code text,
  p_total_quantity integer
)
returns uuid
language plpgsql
as $$
declare
  v_remaining integer;
  v_order_id uuid;
begin
  if p_total_quantity is null or p_total_quantity <= 0 then
    raise exception 'Total quantity must be > 0';
  end if;

  select s.remaining_credits
  into v_remaining
  from public.subscriptions s
  where s.id = p_subscription_id
    and s.user_id = p_user_id
    and s.status = 'active'
    and s.current_period_end > now()
  for update;

  if not found then
    raise exception 'Subscription does not belong to user, is inactive, or is expired';
  end if;

  if v_remaining < p_total_quantity then
    raise exception 'Not enough credits';
  end if;

  insert into public.orders (user_id, subscription_id, delivery_type, zip_code, status)
  values (p_user_id, p_subscription_id, coalesce(p_delivery_type, 'pickup'), p_zip_code, 'pending')
  returning id into v_order_id;

  update public.subscriptions
  set remaining_credits = remaining_credits - p_total_quantity
  where id = p_subscription_id;

  return v_order_id;
end;
$$;

create or replace function public.create_order_atomic_with_items(
  p_user_id uuid,
  p_subscription_id uuid,
  p_delivery_type delivery_type,
  p_zip_code text,
  p_items jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_total_quantity integer;
  v_order_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Items must be a non-empty JSON array';
  end if;

  with parsed as (
    select
      (value->>'meal_id')::uuid as meal_id,
      (value->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as value
  ),
  aggregated as (
    select meal_id, sum(quantity) as quantity
    from parsed
    group by meal_id
  )
  select sum(quantity)
  into v_total_quantity
  from aggregated;

  if v_total_quantity is null or v_total_quantity <= 0 then
    raise exception 'Total quantity must be > 0';
  end if;

  if exists (
    with parsed as (
      select
        (value->>'meal_id')::uuid as meal_id,
        (value->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as value
    )
    select 1 from parsed
    where meal_id is null or quantity is null or quantity <= 0
  ) then
    raise exception 'Each item must include meal_id and quantity > 0';
  end if;

  v_order_id := public.create_order_atomic(
    p_user_id,
    p_subscription_id,
    p_delivery_type,
    p_zip_code,
    v_total_quantity
  );

  with parsed as (
    select
      (value->>'meal_id')::uuid as meal_id,
      (value->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as value
  ),
  aggregated as (
    select meal_id, sum(quantity) as quantity
    from parsed
    group by meal_id
  )
  insert into public.order_items (order_id, meal_id, quantity)
  select v_order_id, meal_id, quantity
  from aggregated;

  return v_order_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.users.full_name);
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end
$$;

revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;

create table if not exists public.users (
  id uuid primary key,
  email text unique,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin', 'kitchen')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  meals_per_cycle integer not null check (meals_per_cycle > 0),
  price_cents integer not null check (price_cents >= 0),
  stripe_price_id text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  stripe_subscription_id text not null unique,
  status subscription_status not null default 'active',
  remaining_credits integer not null check (remaining_credits >= 0),
  current_period_start timestamptz,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_zones (
  zip_code text primary key,
  delivery_fee integer not null check (delivery_fee >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_menus (
  menu_date date not null,
  meal_id uuid not null references public.meals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (menu_date, meal_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  delivery_type delivery_type not null default 'pickup',
  zip_code text,
  status order_status not null default 'pending',
  stripe_payment_id text,
  order_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (order_id, meal_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_users_updated_at') then
    create trigger trg_users_updated_at before update on public.users
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_plans_updated_at') then
    create trigger trg_plans_updated_at before update on public.plans
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_meals_updated_at') then
    create trigger trg_meals_updated_at before update on public.meals
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_subscriptions_updated_at') then
    create trigger trg_subscriptions_updated_at before update on public.subscriptions
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_zones_updated_at') then
    create trigger trg_delivery_zones_updated_at before update on public.delivery_zones
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_orders_updated_at') then
    create trigger trg_orders_updated_at before update on public.orders
    for each row execute function public.set_updated_at();
  end if;
end
$$;

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_period_end on public.subscriptions(current_period_end);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_subscription_id on public.orders(subscription_id);
create index if not exists idx_orders_order_date on public.orders(order_date);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_daily_menus_menu_date on public.daily_menus(menu_date);

alter table public.users enable row level security;
alter table public.plans enable row level security;
alter table public.meals enable row level security;
alter table public.subscriptions enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.daily_menus enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'plans' and policyname = 'plans_select_public') then
    create policy plans_select_public on public.plans for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'meals' and policyname = 'meals_select_public') then
    create policy meals_select_public on public.meals for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'daily_menus' and policyname = 'daily_menus_select_public') then
    create policy daily_menus_select_public on public.daily_menus for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_zones' and policyname = 'delivery_zones_select_public') then
    create policy delivery_zones_select_public on public.delivery_zones for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'users_select_own') then
    create policy users_select_own on public.users for select to authenticated using (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'users_update_own') then
    create policy users_update_own on public.users for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_select_own') then
    create policy subscriptions_select_own on public.subscriptions for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_select_own') then
    create policy orders_select_own on public.orders for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_items' and policyname = 'order_items_select_own') then
    create policy order_items_select_own on public.order_items for select to authenticated using (
      exists (
        select 1 from public.orders o
        where o.id = order_items.order_id and o.user_id = auth.uid()
      )
    );
  end if;
end
$$;
