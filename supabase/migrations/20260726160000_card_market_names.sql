begin;

alter table public.cards
  add column if not exists market_name text,
  add column if not exists market_name_updated_at timestamptz,
  add column if not exists market_name_updated_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cards'::regclass
      and conname = 'cards_market_name_not_blank_check'
  ) then
    alter table public.cards
      add constraint cards_market_name_not_blank_check
      check (market_name is null or length(trim(market_name)) between 2 and 120);
  end if;
end
$$;

create table if not exists public.card_market_name_suggestions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  card_id uuid not null,
  proposed_market_name text not null,
  proposed_aliases text[] not null default '{}',
  confidence text not null default 'research_required',
  status text not null default 'pending',
  research_note text,
  rejection_note text,
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_market_name_suggestions_card_game_fk
    foreign key (card_id, game_id)
    references public.cards(id, game_id)
    on delete cascade,
  constraint card_market_name_suggestions_card_name_key
    unique (card_id, proposed_market_name),
  constraint card_market_name_suggestions_name_check
    check (length(trim(proposed_market_name)) between 2 and 120),
  constraint card_market_name_suggestions_alias_count_check
    check (coalesce(array_length(proposed_aliases, 1), 0) <= 30),
  constraint card_market_name_suggestions_confidence_check
    check (confidence in ('high', 'medium_high', 'medium', 'research_required')),
  constraint card_market_name_suggestions_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create table if not exists public.card_market_name_evidence (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.card_market_name_suggestions(id) on delete cascade,
  source_type text not null,
  source_name text not null,
  source_url text not null,
  source_title text,
  evidence_note text,
  created_at timestamptz not null default now(),
  constraint card_market_name_evidence_source_key unique (suggestion_id, source_url),
  constraint card_market_name_evidence_source_type_check
    check (source_type in ('tcgplayer_product', 'tcgplayer_editorial', 'official', 'marketplace', 'community', 'admin')),
  constraint card_market_name_evidence_name_check
    check (length(trim(source_name)) between 2 and 80),
  constraint card_market_name_evidence_url_check
    check (source_url ~ '^https://')
);

create table if not exists public.card_market_aliases (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  card_id uuid not null,
  alias text not null,
  normalized_alias text generated always as (
    trim(regexp_replace(lower(alias), '[^a-z0-9]+', ' ', 'g'))
  ) stored,
  source_suggestion_id uuid references public.card_market_name_suggestions(id) on delete set null,
  approved_by uuid,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_market_aliases_card_game_fk
    foreign key (card_id, game_id)
    references public.cards(id, game_id)
    on delete cascade,
  constraint card_market_aliases_alias_check
    check (length(trim(alias)) between 2 and 120),
  constraint card_market_aliases_card_alias_key
    unique (card_id, normalized_alias)
);

create index if not exists card_market_name_suggestions_review_idx
  on public.card_market_name_suggestions (game_id, status, confidence, created_at, id);

create index if not exists card_market_name_evidence_suggestion_idx
  on public.card_market_name_evidence (suggestion_id, created_at, id);

create index if not exists card_market_aliases_search_idx
  on public.card_market_aliases (game_id, normalized_alias, card_id);

create index if not exists cards_market_name_search_idx
  on public.cards (game_id, lower(market_name))
  where market_name is not null;

alter table public.card_market_name_suggestions enable row level security;
alter table public.card_market_name_evidence enable row level security;
alter table public.card_market_aliases enable row level security;

revoke all on table public.card_market_name_suggestions from anon, authenticated;
revoke all on table public.card_market_name_evidence from anon, authenticated;
revoke all on table public.card_market_aliases from anon, authenticated;

grant select, insert, update, delete on table public.card_market_name_suggestions to service_role;
grant select, insert, update, delete on table public.card_market_name_evidence to service_role;
grant select, insert, update, delete on table public.card_market_aliases to service_role;

comment on column public.cards.market_name is
  'Admin-approved investor/collector display name. The provider or official card name remains canonical identity.';
comment on table public.card_market_aliases is
  'Approved, non-unique search aliases for exact card variants. The same alias may intentionally resolve to multiple cards.';
comment on table public.card_market_name_suggestions is
  'Game-scoped curation queue. Suggestions never affect public display until an admin approves them.';
comment on table public.card_market_name_evidence is
  'Source links supporting a proposed market name, with TCGplayer product/editorial evidence distinguished from community usage.';

create or replace function public.approve_card_market_name_suggestion(
  p_suggestion_id uuid,
  p_market_name text,
  p_aliases text[],
  p_admin_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion_row public.card_market_name_suggestions%rowtype;
  alias_value text;
begin
  select *
  into strict suggestion_row
  from public.card_market_name_suggestions
  where id = p_suggestion_id
  for update;

  p_market_name := trim(regexp_replace(coalesce(p_market_name, ''), '\s+', ' ', 'g'));
  if length(p_market_name) < 2 or length(p_market_name) > 120 then
    raise exception 'Market name must contain between 2 and 120 characters.';
  end if;

  update public.cards
  set
    market_name = p_market_name,
    market_name_updated_at = now(),
    market_name_updated_by = p_admin_user_id
  where id = suggestion_row.card_id
    and game_id = suggestion_row.game_id;

  delete from public.card_market_aliases
  where source_suggestion_id = suggestion_row.id;

  foreach alias_value in array coalesce(p_aliases, '{}'::text[])
  loop
    alias_value := trim(regexp_replace(coalesce(alias_value, ''), '\s+', ' ', 'g'));
    if length(alias_value) between 2 and 120 then
      insert into public.card_market_aliases (
        game_id,
        card_id,
        alias,
        source_suggestion_id,
        approved_by,
        approved_at,
        updated_at
      ) values (
        suggestion_row.game_id,
        suggestion_row.card_id,
        alias_value,
        suggestion_row.id,
        p_admin_user_id,
        now(),
        now()
      )
      on conflict on constraint card_market_aliases_card_alias_key
      do update set
        alias = excluded.alias,
        source_suggestion_id = excluded.source_suggestion_id,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        updated_at = excluded.updated_at;
    end if;
  end loop;

  update public.card_market_name_suggestions
  set
    proposed_market_name = p_market_name,
    proposed_aliases = coalesce(p_aliases, '{}'::text[]),
    status = 'approved',
    rejection_note = null,
    reviewed_by = p_admin_user_id,
    reviewed_at = now(),
    updated_at = now()
  where id = suggestion_row.id;
end
$$;

create or replace function public.reject_card_market_name_suggestion(
  p_suggestion_id uuid,
  p_rejection_note text default null,
  p_admin_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion_status text;
begin
  select status
  into strict suggestion_status
  from public.card_market_name_suggestions
  where id = p_suggestion_id
  for update;

  if suggestion_status = 'approved' then
    raise exception 'Approved market names must be edited, not rejected.';
  end if;

  update public.card_market_name_suggestions
  set
    status = 'rejected',
    rejection_note = nullif(trim(coalesce(p_rejection_note, '')), ''),
    reviewed_by = p_admin_user_id,
    reviewed_at = now(),
    updated_at = now()
  where id = p_suggestion_id;
end
$$;

revoke all on function public.approve_card_market_name_suggestion(uuid, text, text[], uuid) from public;
revoke all on function public.reject_card_market_name_suggestion(uuid, text, uuid) from public;
grant execute on function public.approve_card_market_name_suggestion(uuid, text, text[], uuid) to service_role;
grant execute on function public.reject_card_market_name_suggestion(uuid, text, uuid) to service_role;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    ('OP13-118_p3', 'Red Manga Luffy', array['Red Luffy Manga', 'OP13 Red Manga Luffy'], 'high', 'TCGplayer editorial uses Red Manga Luffy for this exact red super alternate-art printing.'),
    ('P-PRB02-005', 'Red Bull Luffy', array['Red Bull Double DON!! Luffy', 'Redbull Luffy'], 'high', 'TCGplayer market coverage uses Red Bull Luffy for this exact promotional printing.'),
    ('OP07-038_sp_eb02', 'Gold Boa Leader', array['EB02 Gold Boa Leader', 'Gold Boa Hancock Leader'], 'medium', 'Marketplace shorthand is consistent, but this must not be confused with Boa Lisa.'),
    ('P-OP09-002', 'Treasure Cup Uta', array['TC Uta', 'Uta Treasure Cup 2025'], 'medium_high', 'A safe investor-first shortening of the exact event title in the provider catalog.'),
    ('ST01-012_p3', 'Oda Signature Luffy', array['Oda Sig Luffy', 'Signed Luffy', 'Oda Signed Luffy'], 'high', 'The exact product is the gold-stamped Eiichiro Oda signature treatment.'),
    ('OP05-119_p2', 'Gear 5 Manga Luffy', array['G5 Manga Luffy', 'OP05 Manga Luffy', 'Manga Gear 5 Luffy'], 'high', 'TCGplayer and collector coverage consistently connect this exact OP05 manga printing with Gear 5.'),
    ('OP09-118_p2', 'Manga Roger', array['Roger Manga', 'OP09 Manga Roger'], 'medium_high', 'Stable treatment-first shorthand for the exact manga printing.'),
    ('OP13-120_p3', 'Red Manga Sabo', array['Red Sabo Manga', 'OP13 Red Manga Sabo'], 'high', 'Part of the OP13 red manga trio described in market coverage.'),
    ('EB02-061_p2', 'Gear 2 Manga Luffy', array['G2 Manga Luffy', 'EB02 Manga Luffy', 'Manga Gear 2 Luffy'], 'high', 'Marketplace and collector usage consistently identifies the depicted transformation as Gear 2.'),
    ('OP05-119_p7', 'Silver SP Luffy', array['Silver Luffy', 'OP11 Silver Luffy', 'Silver Gear 5 Luffy'], 'high', 'TCGplayer editorial distinguishes the silver and gold OP11 SP treatments.'),
    ('OP13-119_p3', 'Red Manga Ace', array['Red Ace Manga', 'OP13 Red Manga Ace'], 'high', 'Part of the OP13 red manga trio described in market coverage.'),
    ('OP05-119_p8', 'Gold SP Luffy', array['Gold Luffy', 'Golden Luffy', 'Gold Gear 5 Luffy', 'Gold G5 Luffy', 'OP11 Gold Luffy'], 'high', 'TCGplayer identifies the exact product as the gold SP; SP remains in the display name to prevent ambiguity with prize cards.'),
    ('P-OP07-109', 'Serial Luffy', array['Serial Numbered Luffy', 'Championship Serial Luffy', 'OP07 Serial Luffy'], 'high', 'Bandai officially calls OP07-109 Serial Numbered Luffy.'),
    ('OP05-119_r2', 'PRB01 Manga Luffy', array['PRB Manga Luffy', 'PRB01 Gear 5 Manga Luffy'], 'medium_high', 'Set-qualified naming prevents confusion with the original OP05 manga printing.'),
    ('OP01-078_p2', 'Boa Lisa', array['Boa-Lisa', 'OP04 Boa Lisa', 'Mona Lisa Boa'], 'high', 'Repeated collector nickname for the OP01-078 SP distributed in OP04; it does not refer to the EB02 gold Boa leader.')
)
insert into public.card_market_name_suggestions (
  game_id,
  card_id,
  proposed_market_name,
  proposed_aliases,
  confidence,
  research_note
)
select
  cards.game_id,
  cards.id,
  candidates.market_name,
  candidates.aliases,
  candidates.confidence,
  candidates.research_note
from one_piece
join public.cards cards on cards.game_id = one_piece.id
join candidates on candidates.card_image_id = cards.card_image_id
on conflict (card_id, proposed_market_name) do nothing;

with evidence(card_image_id, market_name, source_type, source_name, source_url, source_title, evidence_note) as (
  values
    ('OP13-118_p3', 'Red Manga Luffy', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Most-Expensive-One-Piece-Cards-in-Carrying-On-His-Will-OP-13/3d94074b-f7d5-4706-82ae-8f4ce8a7e7e8/', 'The 10 Most Expensive One Piece Cards in Carrying On His Will', 'Uses Red Manga Luffy for the exact OP13-118 printing.'),
    ('P-PRB02-005', 'Red Bull Luffy', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-Biggest-One-Piece-Card-Game-Market-Shifts-In-June-2026/8ed68626-3ba8-4266-8d03-0492aa0ef8bd/', 'The Biggest One Piece Card Game Market Shifts In June 2026', 'Uses Red Bull Luffy and ties it to PRB02-005.'),
    ('OP07-038_sp_eb02', 'Gold Boa Leader', 'marketplace', 'Carousell', 'https://www.carousell.sg/toys-collectibles/op07-038/q-12/', 'OP07-038 marketplace results', 'Listings use Gold Boa Leader for the EB02 printing.'),
    ('ST01-012_p3', 'Oda Signature Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Monkey.D.Luffy+%28012%29+%28Alternate+Art%29', 'ST01-012 product results', 'Exact product title identifies the gold-stamped signature treatment.'),
    ('ST01-012_p3', 'Oda Signature Luffy', 'marketplace', 'Fanatics Collect', 'https://www.fanaticscollect.com/weekly/930f4c98-59e0-11f1-b5b1-0259a6df3a4f/2023-one-piece-awakening-new-era-1st-anniv-sr-monkey-d-luffy-oda-signature-st01-012-bgs-95', 'Oda Signature ST01-012 auction', 'Auction title uses Oda Signature for the exact card.'),
    ('OP05-119_p2', 'Gear 5 Manga Luffy', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Most-Expensive-One-Piece-Cards/690d6de6-5b0b-4d1b-bda6-3cfe9c28fc38/', 'The 10 Most Expensive One Piece Cards', 'Connects OP05-119 Manga with the first Gear 5 representation.'),
    ('OP13-120_p3', 'Red Manga Sabo', 'marketplace', 'WinTheCard', 'https://winthecard.com/blog/the-best-chase-cards-in-op13-carrying-on-his-will-one-piece-tcg', 'The Best Chase Cards in OP13', 'Describes the Luffy, Ace, and Sabo red manga trio.'),
    ('EB02-061_p2', 'Gear 2 Manga Luffy', 'marketplace', 'eBay', 'https://www.ebay.com/shop/eb02-luffy-manga?_nkw=eb02+luffy+manga', 'EB02 Luffy manga marketplace results', 'Repeated listing usage includes Gear 2 Manga Luffy and exact card number EB02-061.'),
    ('OP05-119_p7', 'Silver SP Luffy', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Most-Expensive-One-Piece-Cards-of-2025/46ec13bd-9ff5-4256-8f25-fd69cf7daab1/', 'The 10 Most Expensive One Piece Cards of 2025', 'Editorial heading distinguishes the silver SP treatment.'),
    ('OP13-119_p3', 'Red Manga Ace', 'marketplace', 'WinTheCard', 'https://winthecard.com/blog/the-best-chase-cards-in-op13-carrying-on-his-will-one-piece-tcg', 'The Best Chase Cards in OP13', 'Describes the Luffy, Ace, and Sabo red manga trio.'),
    ('OP05-119_p8', 'Gold SP Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Monkey.D.Luffy+%28119%29+%28SP%29', 'OP05-119 SP product results', 'Exact product title distinguishes the gold SP treatment.'),
    ('OP05-119_p8', 'Gold SP Luffy', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Most-Expensive-One-Piece-Cards-of-2025/46ec13bd-9ff5-4256-8f25-fd69cf7daab1/', 'The 10 Most Expensive One Piece Cards of 2025', 'Editorial coverage separates the gold and silver SP versions.'),
    ('P-OP07-109', 'Serial Luffy', 'official', 'Bandai', 'https://asia-en.onepiece-cardgame.com/topics/017.php', 'Serial Numbered Luffy GET Campaign', 'Official campaign calls OP07-109 Serial Numbered Luffy.'),
    ('OP05-119_r2', 'PRB01 Manga Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Monkey.D.Luffy+%28OP05-119%29+%28Manga%29', 'PRB01 OP05-119 manga product results', 'Exact product is the Premium Booster manga printing.'),
    ('OP01-078_p2', 'Boa Lisa', 'community', 'Reddit / OnePieceTCGFinance', 'https://www.reddit.com/r/OnePieceTCGFinance/comments/1s6c1sb/traded_some_pokemon_for_the_boa_lisa_and_was/', 'Boa Lisa collector discussion', 'Explicitly maps Boa Lisa to the OP04 Boa SP.'),
    ('OP01-078_p2', 'Boa Lisa', 'marketplace', 'Limitless One Piece', 'https://onepiece.limitlesstcg.com/cards/OP01-078?v=2', 'Boa Hancock OP01-078 printings', 'Confirms the OP04 Special Card identity for this exact printing.')
)
insert into public.card_market_name_evidence (
  suggestion_id,
  source_type,
  source_name,
  source_url,
  source_title,
  evidence_note
)
select
  suggestions.id,
  evidence.source_type,
  evidence.source_name,
  evidence.source_url,
  evidence.source_title,
  evidence.evidence_note
from evidence
join public.cards cards on cards.card_image_id = evidence.card_image_id
join public.games games on games.id = cards.game_id and games.slug = 'one_piece'
join public.card_market_name_suggestions suggestions
  on suggestions.card_id = cards.id
 and suggestions.proposed_market_name = evidence.market_name
on conflict (suggestion_id, source_url) do nothing;

commit;
