-- Subscriber reminders reuse the campaign batch system.
alter table email_campaigns
  add column if not exists kind text not null default 'marketing',
  add column if not exists menu_window_id uuid,
  add column if not exists delivery_day text,
  add column if not exists cutoff_at timestamptz,
  add column if not exists reminder_type text,
  add column if not exists image_url text;

alter table email_campaign_recipients
  add column if not exists customer_id uuid,
  add column if not exists skipped_at timestamptz;

alter table email_campaign_batches
  add column if not exists skipped_count int not null default 0;
