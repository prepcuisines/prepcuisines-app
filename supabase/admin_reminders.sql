create table if not exists public.admin_reminders (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  remind_on date not null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_reminders_due_idx on public.admin_reminders (remind_on) where dismissed_at is null;
alter table public.admin_reminders enable row level security;
