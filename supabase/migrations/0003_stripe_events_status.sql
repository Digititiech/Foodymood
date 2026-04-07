alter table public.stripe_events
add column if not exists event_type text,
add column if not exists status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
add column if not exists last_error text,
add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_stripe_events_updated_at') then
    create trigger trg_stripe_events_updated_at before update on public.stripe_events
    for each row execute function public.set_updated_at();
  end if;
end
$$;
