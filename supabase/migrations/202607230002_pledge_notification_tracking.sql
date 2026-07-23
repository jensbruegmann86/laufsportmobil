alter table public.pledges
  add column if not exists notification_sent_at timestamptz,
  add column if not exists notification_send_count integer not null default 0;

create index if not exists pledges_notification_sent_at_idx
  on public.pledges (notification_sent_at);
