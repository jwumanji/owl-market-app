# Multi-game onboarding and operations

## Architecture decision

Use the existing Supabase project and game-scoped tables. A game does not get a
new database by default. Every catalog, identity, price, inventory, and sync row
must carry game_id directly or through a composite same-game relationship.

Separate databases are reserved for a demonstrated isolation, residency, or
scale requirement. They are not the normal onboarding path.

## Sources of truth

- Supabase games rows own runtime active/public launch state and launch metadata.
- src/lib/games/registry.ts owns application routing, provider adapters, and
  feature capability status.
- config/game-sync-jobs.json owns game-scoped production sync schedules.
- The boundary audit must pass before a registry or database launch-state change
  is released.

The database and registry must agree for every public game. A mismatch is a
release blocker even when routes happen to remain reachable.

## Lifecycle

Games move through planned, seeded, and active states.

Capabilities move independently through:

- unsupported: the feature does not apply to the game.
- planned: no public route should be linked yet.
- preview: the route may be linked but must explain incomplete coverage.
- live: the feature has passed its data, source, and operational gates.

Public navigation is generated from this capability matrix. Do not add
game-name conditionals to navigation when a capability status can express the
same decision.

## Onboarding sequence

1. Source and asset approval
   - Record canonical catalog, commercial provider, image, and rules-text sources.
   - Confirm storage, caching, attribution, and public-display permissions.
2. Seed identity
   - Add the games row, editions, set types, rarities, variants, and provider mappings.
   - Keep is_public false and registry capabilities planned.
3. Stage catalog data
   - Store raw source records before publishing normalized rows.
   - Require stable provider IDs; never deduplicate cards by name alone.
4. Normalize catalog
   - Populate sets, cards, printings, commercial variants, and external IDs.
   - Run duplicate, missing-game-id, and cross-game relationship audits.
5. Reconcile prices
   - Join exact provider product/SKU identities.
   - Quarantine provider-ahead, sealed, ambiguous, and catalog-only records.
   - Publish only the approved condition, language, finish, currency, and region.
6. Register operations
   - Add jobs to config/game-sync-jobs.json.
   - Run npm run sync-schedule:generate.
   - Require npm run audit:sync-schedule to pass.
7. Launch preview
   - Record explicit launch metadata in the games row.
   - Change only approved capabilities to preview or live.
   - Run boundary, reconciliation, public-page, and provider audits.
8. Launch public
   - Set database and registry public/active state together.
   - Deploy, smoke-test every navigable capability, and preserve rollback flags.

## Required checks

Before deployment:

- npm run lint
- npx tsc --noEmit
- npm run test:multitcg
- npm run audit:sync-schedule
- npm run audit:game-boundaries
- npm run audit:multitcg-reconcile
- supabase migration list --linked
- supabase db push --linked --dry-run

After deployment:

- Confirm the production deployment is Ready and aliased.
- Smoke-test catalog, market, set, taxonomy, identity, and any preview routes.
- Confirm no cross-game rows, duplicate scoped identities, or missing game_id.
- Confirm sync locks release and one bounded provider batch is idempotent.

## Pricing read cutover

Adding a new game does not authorize a global normalized-price read cutover.
Keep MULTITCG_READ_MODE=legacy until One Piece preferred-price coverage, eBay
variant resolution, canonical JP/eBay backfills, and golden comparisons pass.

Dual writing may remain enabled while reads stay legacy. Advance to
shadow_compare and preferred_projection only in separately verified gates.

## Schedule changes

Do not hand-edit game-scoped cron entries in vercel.json. Change the manifest,
regenerate, and audit. Non-game operational jobs such as image warming remain
outside the manifest until a dispatcher migration is separately rehearsed.

The next scheduling phase may replace the generated cron entries with a
persistent dispatcher/queue. That cutover must preserve one-job locks, bounded
batches, retry state, and per-game/provider observability before activation.
