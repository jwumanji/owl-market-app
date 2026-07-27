begin;

-- Keep the public One Piece market indexes aligned with the English catalog.
-- The server-side fallback already applies this scope, but the cached summary
-- function historically counted JP rows as well.
do $$
declare
  current_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.refresh_public_game_summaries(uuid)'::regprocedure)
  into current_definition;

  if current_definition is null then
    raise exception 'refresh_public_game_summaries(uuid) is not installed';
  end if;

  if position($check$and (game_row.slug <> 'one_piece' or cards.region = 'en')$check$ in current_definition) = 0 then
    corrected_definition := replace(
      current_definition,
      $from$where cards.game_id = game_row.id$from$,
      $to$where cards.game_id = game_row.id
        and (game_row.slug <> 'one_piece' or cards.region = 'en')$to$
    );

    if corrected_definition = current_definition then
      raise exception 'Unexpected refresh_public_game_summaries definition; English-region scope was not applied';
    end if;

    execute corrected_definition;
  end if;
end
$$;

-- Repair the two legacy English rows that are known TR printings but were
-- imported under their base/SP rarity. These predicates include the release
-- set so a same-number base printing cannot be touched accidentally.
with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), corrected_cards as (
  select cards.id, cards.card_image_id
  from public.cards
  join one_piece on one_piece.id = cards.game_id
  join public.sets
    on sets.id = cards.set_id
   and sets.game_id = cards.game_id
  where cards.region = 'en'
    and (
      (cards.card_image_id = 'OP07-109_p2' and sets.code = 'OP08')
      or (cards.card_image_id = 'ST18-004_p1' and sets.code = 'OP09')
    )
)
update public.cards
set
  rarity = 'TR',
  variant_label = 'TR',
  name = case
    when card_image_id = 'OP07-109_p2' then regexp_replace(name, '\\(SP\\)', '(TR)', 'i')
    when name !~* '\\(TR\\)' then name || ' (TR)'
    else name
  end
where id in (select id from corrected_cards);

-- Existing correctly classified TR rows may predate variant_label. Setting it
-- makes provider matching deterministic and prevents a later base-card match.
update public.cards
set variant_label = 'TR'
where game_id = (select id from public.games where slug = 'one_piece')
  and region = 'en'
  and upper(coalesce(rarity, '')) = 'TR'
  and coalesce(variant_label, '') = '';

select public.refresh_public_game_summaries(
  (select id from public.games where slug = 'one_piece')
);

commit;
