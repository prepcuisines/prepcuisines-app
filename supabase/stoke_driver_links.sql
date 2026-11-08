create table if not exists public.stoke_driver_links (
  token text primary key,
  delivery_date text not null,
  driver text not null,
  done jsonb not null default '[]'::jsonb,
  first_opened_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists stoke_driver_links_date_idx on public.stoke_driver_links (delivery_date, driver);
alter table public.stoke_driver_links enable row level security;
