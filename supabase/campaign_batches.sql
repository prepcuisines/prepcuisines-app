-- Campaign batch sending: fixed batches of max 400, one sending at a time.
create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  template_key text not null,
  audience text not null,
  created_at timestamptz not null default now()
);

create table if not exists email_campaign_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  batch_number int not null,
  recipient_count int not null check (recipient_count between 1 and 400),
  status text not null default 'ready' check (status in ('ready','scheduled','sending','sent')),
  scheduled_at timestamptz,
  started_at timestamptz,
  sent_at timestamptz,
  lease_until timestamptz,
  sent_count int not null default 0,
  failed_count int not null default 0,
  unique (campaign_id, batch_number)
);

-- Only ONE batch can be sending at any moment, across all campaigns.
create unique index if not exists one_campaign_batch_sending
  on email_campaign_batches ((true)) where status = 'sending';

create table if not exists email_campaign_recipients (
  id bigserial primary key,
  batch_id uuid not null references email_campaign_batches(id) on delete cascade,
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  email text not null,
  first_name text,
  sent_at timestamptz,
  failed_at timestamptz,
  error text,
  unique (campaign_id, email)   -- nobody gets the same campaign twice
);
create index if not exists email_campaign_recipients_batch_idx on email_campaign_recipients (batch_id);

-- Hard cap: the database refuses a 401st person in any batch.
create or replace function enforce_campaign_batch_cap() returns trigger
language plpgsql as $$
begin
  if (select count(*) from email_campaign_recipients where batch_id = new.batch_id) >= 400 then
    raise exception 'Batch % already has 400 recipients', new.batch_id;
  end if;
  return new;
end $$;
drop trigger if exists campaign_batch_cap on email_campaign_recipients;
create trigger campaign_batch_cap before insert on email_campaign_recipients
  for each row execute function enforce_campaign_batch_cap();

-- Permanent unsubscribe list used by every campaign.
create table if not exists email_suppressions (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table email_campaigns enable row level security;
alter table email_campaign_batches enable row level security;
alter table email_campaign_recipients enable row level security;
alter table email_suppressions enable row level security;
