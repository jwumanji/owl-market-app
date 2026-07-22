begin;
-- Keep every public card-value summary on the same metric the UI displays.
-- A positive market_avg is canonical; tcg_market is used only when the
-- average is absent or non-positive. The function also retains all integrity
-- changes already installed on the remote database (English One Piece scope,
-- nullable price changes, and rarity normalization).
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

  corrected_definition := replace(
    current_definition,
    $from$coalesce(price_stats.tcg_market, price_stats.market_avg)$from$,
    $to$case
          when price_stats.market_avg > 0 then price_stats.market_avg
          when price_stats.tcg_market > 0 then price_stats.tcg_market
          else null
        end$to$
  );

  -- One Piece variant imports intentionally reclassify cards.rarity (MR, SP,
  -- AA, and similar collector tiers). Some older rarity_id values still point
  -- at the printed/base rarity, so cards.rarity must win for this game.
  if position($check$when game_row.slug = 'one_piece' then coalesce($check$ in corrected_definition) = 0 then
    corrected_definition := replace(
      corrected_definition,
      $from$          else coalesce($from$,
      $to$          when game_row.slug = 'one_piece' then coalesce(
              nullif(upper(trim(cards.rarity)), ''),
              nullif(upper(trim(game_rarities.code)), ''),
              'UNKNOWN'
            )
            else coalesce($to$
    );
  end if;

  corrected_definition := replace(
    corrected_definition,
    $from$'avg', coalesce(market_avg, 0)$from$,
    $to$'avg', coalesce(effective_price, 0)$to$
  );

  corrected_definition := replace(
    corrected_definition,
    $from$order by priced_cards.effective_price desc nulls last, priced_cards.name$from$,
    $to$order by
            priced_cards.effective_price desc nulls last,
            priced_cards.tcg_market desc nulls last,
            priced_cards.name,
            priced_cards.id$to$
  );

  corrected_definition := replace(
    corrected_definition,
    $from$order by effective_price desc nulls last, name$from$,
    $to$order by
            effective_price desc nulls last,
            tcg_market desc nulls last,
            name,
            id$to$
  );

  if position($old$coalesce(price_stats.tcg_market, price_stats.market_avg)$old$ in corrected_definition) > 0
    or position($check$when price_stats.market_avg > 0 then price_stats.market_avg$check$ in corrected_definition) = 0
    or position($check$'avg', coalesce(effective_price, 0)$check$ in corrected_definition) = 0
    or position($check$priced_cards.tcg_market desc nulls last$check$ in corrected_definition) = 0
    or position($check$when game_row.slug = 'one_piece' then coalesce($check$ in corrected_definition) = 0
  then
    raise exception 'Unexpected refresh_public_game_summaries definition; market_avg upgrade was not applied';
  end if;

  if corrected_definition <> current_definition then
    execute corrected_definition;
  end if;
end
$$;
-- Refresh every game so no cached rarity or character summary remains on the
-- prior tcg_market-first metric.
select public.refresh_public_game_summaries();
commit;
