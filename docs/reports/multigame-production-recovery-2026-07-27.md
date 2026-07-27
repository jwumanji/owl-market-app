# Multi-game production recovery — 2026-07-27

## Outcome

The recovery branch `codex/restore-multigame-production` combines current
`origin/main` with the productive Riftbound and Lorcana release lineages,
later market-dashboard and image-layout work, and the release guardrails found
during the audit.

No production deployment, database write, push, or pull request was performed
as part of this recovery.

## What caused the disappearance

- Current production follows `origin/main` at `ddc1b19`.
- Riftbound and Lorcana were developed and deployed from parallel branches but
  were never integrated into `main`.
- Later production switches back to `main` therefore removed their registry,
  menu, homepage, schedule, and release wiring from the deployed source tree.
- The live `games` row for Riftbound is also `is_public = false`, despite its
  catalog and exact-price publication metadata remaining healthy.

## Productive lineages retained

- Current main: card detail, marketplace comparison, news/articles, rarity
  artwork, current design and performance work.
- `codex/lorcana-data-live`: complete multi-game foundation; Riftbound catalog,
  reconciliation, exact pricing, deployment hardening, champions, schedules,
  image health, market snapshots; Lorcana catalog, navigation, pricing, and
  character cache.
- Riftbound market parity: dashboard layout and rarity artwork fixes.
- Edgeless image work: card and market image-frame cleanup.
- Cursor reliability: restored the exact-price audit regression test that was
  lost from a later branch.

## Preserved unfinished work

The original dirty checkout was not edited. Its 88 status entries were copied,
byte-verified, and committed separately as:

- branch: `codex/recovery-snapshot-20260727`
- commit: `24feb6c chore(recovery): snapshot current working tree`

That snapshot includes the unfinished card market-name review system and its
`20260726160000_card_market_names.sql` migration. It is intentionally not in
the production recovery branch because deploying its UI before applying the
database migration would break card queries.

## Navigation and layout recovered

- Game switcher: One Piece, Riftbound, Disney Lorcana.
- Homepage: six-card, three-column desktop hierarchy with the three live games
  first and planned games second.
- One Piece menu: Markets, News, Characters, Sets, Rarities, planned Japan
  Market, planned eBay Sales, All Cards.
- Riftbound menu: Markets, News, Champions, Sets, Rarities, Languages, eBay
  Sales, All Cards.
- Lorcana menu: Markets, News, Characters, Sets, Franchises, Rarities, Promos,
  All Cards.
- Lorcana no longer inherits One Piece ticker data or Riftbound empty-state
  copy.

## Scheduling recovered

`config/game-sync-jobs.json` and `vercel.json` now agree:

- 9 declared game jobs.
- 12 Vercel game-cron entries.
- One Piece current prices: four times daily.
- Riftbound incremental prices: hourly at minute 15.
- Riftbound full reconciliation: daily at 04:35 UTC.
- Lorcana current prices: hourly at minute 45.
- Existing One Piece history, eBay, Japanese pricing, character, and summary
  jobs remain intact.
- Existing warmup and cross-game image-audit jobs remain intact as unmanaged
  operational crons.

The forward migration
`20260727120000_public_game_market_index_snapshot_schedule.sql` replaces the
One-Piece-only weekly market-index job with an active-public-game job.

## Database findings

Read-only production audit results:

- Cross-game relationship issues: 0.
- Missing `game_id` rows: 0.
- Scoped card/set/external-ID duplicates: 0.
- Lorcana: active/public, 18 sets, 3,226 cards, 2,930 priced cards,
  exact-match JustTCG publication live.
- Riftbound: active/private, 7 sets, 1,064 cards, 1,055 priced cards,
  exact-match JustTCG pricing live.
- Sole release failure: `riftbound is not public`.

`20260727110000_restore_riftbound_publication.sql` restores the flag only after
checking the approved launch metadata, exact-price metadata, active state, and
minimum catalog/pricing counts. It fails closed if any gate has drifted.

The remote-only migration `20260726143000_terminal_sealed.sql` was fetched and
found to contain only `;`. Its exact no-op history marker is now restored to
Git; no functional database code was missing from that migration.

## Verification

- All Node tests: 84 passed, 0 failed.
- `npm run test:multitcg`: passed, including schedule consistency.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with no warnings or errors.
- `npm run build`: passed, including Owl Lens contract drift check and all 35
  statically generated pages.
- Production build also passed with the private-game preview gate enabled.
- Visual checks confirmed the homepage grid, all three dropdown entries,
  Lorcana live dashboard/menu/data, and the full Riftbound dashboard/data path
  when preview access is enabled.

## Safe release order

1. Push `codex/restore-multigame-production` and open a reviewable PR.
2. Verify the preview deployment and its three game hierarchies.
3. Review and apply pending migrations `20260727110000` and `20260727120000`.
4. Rerun `npm run audit:game-boundaries`; it must pass with Riftbound public.
5. Merge/deploy the recovery branch.
6. Verify the production homepage, switcher, game menus, dashboards, and cron
   inventory before retiring superseded deployments.
