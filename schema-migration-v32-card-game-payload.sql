-- OWL-21 / Phase 3: move One Piece-specific card metadata into game_payload.
--
-- This migration is intentionally additive. Legacy typed columns remain in
-- place during dual-read rollout; app code can prefer game_payload while old
-- reads and scripts continue to work.

begin;

alter table public.cards
  add column if not exists game_payload jsonb;

update public.cards
set game_payload = '{}'::jsonb
where game_payload is null;

alter table public.cards
  alter column game_payload set default '{}'::jsonb,
  alter column game_payload set not null;

comment on column public.cards.game_payload is
  'Game-specific card metadata. For One Piece, see docs/multi-tcg/phase-3-game-payload-migration.md.';

with one_piece as (
  select id as game_id
  from public.games
  where slug = 'one_piece'
)
update public.cards as cards
set game_payload =
  coalesce(cards.game_payload, '{}'::jsonb) ||
  jsonb_strip_nulls(
    jsonb_build_object(
      'schema', 'one_piece.card.v1',
      'card',
        jsonb_strip_nulls(
          jsonb_build_object(
            'card_type', cards.card_type,
            'color', cards.color,
            'power', cards.power,
            'counter', cards.counter,
            'life', cards.life,
            'cost', cards.cost,
            'attribute', cards.attribute,
            'types', cards.types,
            'effect', cards.effect,
            'trigger', cards.trigger,
            'artist', cards.artist
          )
        ),
      'print',
        jsonb_strip_nulls(
          jsonb_build_object(
            'printed_set_code', cards.printed_set_code,
            'promo_segment', cards.promo_segment,
            'promo_source', cards.promo_source,
            'is_stamped', cards.is_stamped,
            'is_serialized', cards.is_serialized,
            'serial_max', cards.serial_max,
            'tournament',
              jsonb_strip_nulls(
                jsonb_build_object(
                  'event', cards.tournament_event,
                  'placement', cards.tournament_placement,
                  'season', cards.tournament_season
                )
              )
          )
        )
    )
  )
from one_piece
where cards.game_id = one_piece.game_id;

create index if not exists idx_cards_game_payload_gin
  on public.cards using gin (game_payload jsonb_path_ops);

notify pgrst, 'reload schema';

commit;
