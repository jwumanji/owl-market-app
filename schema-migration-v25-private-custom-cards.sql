-- v25: private custom cards for user-owned inventory matching.
-- Run this after v24.

create extension if not exists pgcrypto;

create table if not exists custom_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  card_number text,
  set_code text,
  image_url text,
  image_url_small text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_cards_name_not_blank check (length(trim(name)) > 0)
);

create unique index if not exists custom_cards_user_normalized_key
  on custom_cards (
    user_id,
    lower(trim(name)),
    coalesce(lower(trim(set_code)), ''),
    coalesce(lower(trim(card_number)), '')
  );

create index if not exists custom_cards_user_updated_idx
  on custom_cards (user_id, updated_at desc);

alter table inventory_items
  add column if not exists custom_card_id uuid references custom_cards(id) on delete set null;

create index if not exists inventory_items_custom_card_id_idx
  on inventory_items(custom_card_id);

alter table custom_cards enable row level security;

drop policy if exists "Custom cards are private to their owner" on custom_cards;
create policy "Custom cards are private to their owner"
  on custom_cards
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on custom_cards to authenticated;
grant all on custom_cards to service_role;
