begin;

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  livemode boolean not null,
  payload jsonb not null,
  processing_status text not null check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_event_type_idx
  on public.stripe_webhook_events (event_type);

create index if not exists stripe_webhook_events_created_at_idx
  on public.stripe_webhook_events (created_at desc);

alter table public.stripe_webhook_events enable row level security;

commit;
