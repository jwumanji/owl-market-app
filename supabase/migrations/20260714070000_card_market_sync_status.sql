create table if not exists public.card_market_sync_status (
  game_id uuid not null references public.games(id) on delete restrict,
  card_id uuid not null references public.cards(id) on delete cascade,
  provider text not null,
  status text not null,
  result_count integer not null default 0,
  last_attempted_at timestamptz not null default now(),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  primary key (game_id, card_id, provider)
);

create index if not exists idx_card_market_sync_status_provider_attempt
  on public.card_market_sync_status(provider, last_attempted_at desc);

alter table public.card_market_sync_status enable row level security;
