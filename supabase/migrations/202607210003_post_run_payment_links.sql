begin;

create table if not exists public.sponsor_payment_links (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null unique references public.pledges (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur',
  expires_at timestamptz not null,
  paid_at timestamptz,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsor_payment_links_expires_at_idx
  on public.sponsor_payment_links (expires_at);

create index if not exists sponsor_payment_links_pledge_id_idx
  on public.sponsor_payment_links (pledge_id);

create trigger set_updated_at_sponsor_payment_links
before update on public.sponsor_payment_links
for each row
execute function public.set_updated_at();

alter table public.sponsor_payment_links enable row level security;

commit;
