create table if not exists public.weekday_menus (
  day_of_week smallint not null check (day_of_week between 1 and 7),
  meal_id uuid not null references public.meals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (day_of_week, meal_id)
);

create index if not exists idx_weekday_menus_day_of_week on public.weekday_menus(day_of_week);

alter table public.weekday_menus enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weekday_menus' and policyname = 'weekday_menus_select_public') then
    create policy weekday_menus_select_public on public.weekday_menus for select using (true);
  end if;
end
$$;
