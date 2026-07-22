# Riftbound JustTCG Staged Ingestion

Moon Market keeps Riftcodex as the authoritative Riftbound catalog for
gameplay metadata, images, set codes, collector numbers, and treatments.
JustTCG v1 is a staged secondary source for provider identity, variant payloads,
and raw market data.

## Safety policy

- Match cards only through exact TCGplayer product IDs already stored in
  `card_external_ids`.
- Retain every fetched JustTCG set/card payload in `tcg_source_records`, even
  when no exact Moon Market card match exists.
- Add JustTCG card/set external IDs only for deterministic matches.
- Do not update `cards`, `price_stats`, `price_history`,
  `preferred_card_prices`, or public Riftbound pricing from this job.
- Keep `games.metadata.pricing_status = deferred` until variant, condition,
  currency, and publishing rules are approved.

## Deployment order

1. Apply `20260722123000_riftbound_justtcg_staged_ingestion.sql` after the
   multi-TCG foundation migrations.
2. Deploy the application and cron configuration.
3. Run the read-only reconciliation:

   ```powershell
   npm run audit:riftbound-justtcg
   ```

4. Trigger one explicit set before relying on the cursor:

   ```text
   POST /api/sync/justtcg?game=riftbound&sets=origins-riftbound-league-of-legends-trading-card-game
   Authorization: Bearer <CRON_SECRET>
   ```

5. Confirm the response reports `mode: staged_raw_only` and
   `pricesPublished: false`, then verify the corresponding
   `source_ingest_runs` row completed.

## Scheduled behavior

The Vercel cron processes one JustTCG set every six hours. Eight provider sets
therefore complete a normal cycle in roughly two days. The cursor is scoped by
game, provider, API version, catalog, and job, so it does not share One Piece's
JustTCG state.

New JustTCG-only content such as Vendetta remains raw-only until Riftcodex or a
separate canonical Riftbound adapter supplies the game-specific catalog fields.
