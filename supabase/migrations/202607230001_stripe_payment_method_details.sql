alter table public.sponsor_payment_links
  add column if not exists stripe_payment_method_type text,
  add column if not exists stripe_card_brand text,
  add column if not exists stripe_card_last4 text;

create index if not exists sponsor_payment_links_stripe_payment_method_type_idx
  on public.sponsor_payment_links (stripe_payment_method_type);

create index if not exists sponsor_payment_links_stripe_card_brand_idx
  on public.sponsor_payment_links (stripe_card_brand);
