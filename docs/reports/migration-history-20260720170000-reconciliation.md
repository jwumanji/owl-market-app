# Migration history reconciliation: 20260720170000

Date: 2026-07-22
Supabase project: kiquytaevufssveqmqix
Migration: 20260720170000_one_piece_promo_distribution_membership.sql
SHA-256: 08C80D446A58856721A69CD12297A551771DD05D2C86B2379CF1A7AF7046149B

## Before repair

- The migration existed locally but was absent from the remote migration history.
- Later migrations through 20260722140000 were already recorded remotely.
- The migration is a data-only, idempotent update that moves One Piece promotional
  printings with promo_segment into distribution set P.

## Verified postcondition

The read-only set-membership audit reported:

- Cards audited: 4,680
- Valid distribution memberships: 4,680
- Promotional cards outside promo set P: 0
- Blocking findings: 0

Because the live database already satisfied the complete postcondition, the
safe reconciliation is to record this migration as applied rather than replay
an historical data update out of order.

## Required post-repair verification

1. Local and remote migration histories contain 20260720170000.
2. The set-membership audit still reports zero blockers.
3. Multi-TCG foundation reconciliation and game-boundary audits still pass.
