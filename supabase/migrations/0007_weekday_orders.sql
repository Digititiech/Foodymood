create table if not exists public.weekday_orders (
  user_id uuid not null references public.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  meal_id uuid not null references public.meals(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day_of_week, meal_id)
);

create index if not exists idx_weekday_orders_user_day on public.weekday_orders(user_id, day_of_week);

alter table public.weekday_orders enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_weekday_orders_updated_at') then
    create trigger trg_weekday_orders_updated_at before update on public.weekday_orders
    for each row execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weekday_orders' and policyname = 'weekday_orders_select_own') then
    create policy weekday_orders_select_own on public.weekday_orders
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weekday_orders' and policyname = 'weekday_orders_insert_own') then
    create policy weekday_orders_insert_own on public.weekday_orders
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weekday_orders' and policyname = 'weekday_orders_update_own') then
    create policy weekday_orders_update_own on public.weekday_orders
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weekday_orders' and policyname = 'weekday_orders_delete_own') then
    create policy weekday_orders_delete_own on public.weekday_orders
    for delete
    to authenticated
    using (auth.uid() = user_id);
  end if;
end
$$;
