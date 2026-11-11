create table if not exists public.trade_enquiries (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  delivery_address text,
  items jsonb not null default '[]'::jsonb,
  notes text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
alter table public.trade_enquiries enable row level security;
