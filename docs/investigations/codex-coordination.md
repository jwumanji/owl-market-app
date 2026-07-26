# Codex coordination — what production runs that this repo doesn't

**Date:** 2026-07-26
**Status:** findings only. Nothing here has been fixed or applied.

Three findings from tracing migration `20260726110000`, which is recorded in
`supabase_migrations.schema_migrations` but exists in no branch. All three share one
root cause: **an environment outside this repository's history writes to the database
*and* deploys application code.** Neither the file list nor the branch list is a record
of what production runs.

---

## 1. Codex ships application code, not just migrations

`20260726110000` created `public.articles` — a game-scoped editorial table, seeded with
4 published rows. The obvious first read was "dormant table, no consuming code."

**That was wrong. The feature is live.**

```
/games/one-piece/news                       200   lists all 4 slugs and titles
/news/op16-round-one-reveals                307 → /games/one-piece/news/<slug>  200
                                                  renders the article title and body
```

It even follows this repo's own mirror convention — `/news` redirecting into
`/games/[game]/news` — the same pattern `/sets` and `/terminal` use.

**No branch has it.** Checked all **81 remote refs** plus local branches for
`src/app/news/`, `src/app/games/[game]/news/`, and any file referencing `articles` in
`.sql`, `.ts` or `.tsx`. Zero hits.

### Route fingerprint

Production is `https://owl-market-app.vercel.app`, measured 2026-07-26.

| Path | Prod | Which refs contain the route |
|---|---|---|
| `/games/one-piece/news` | **200** | **none of 81** |
| `/news/<slug>` → `/games/one-piece/news/<slug>` | **307 → 200** | **none of 81** |
| `/games/one-piece/markets` | 200 | all |
| `/games/lorcana/sets`, `/games/riftbound/sets` | 200 | generic game-scoped route — all |
| `/games/riftbound`, `/games/lorcana` | 200 | generic — all |
| `/games/one-piece/champions` | 404 | 9 branches incl. `lorcana-data-live` and `market-index-snapshots-`**`prod`** — but *not* `market-index-snapshots` |
| `/games/one-piece/franchises` | 404 | `lorcana-data-live`, `lorcana-live-republish`, `riftbound-markets-parity` |
| `/games/one-piece/promos` | 404 | same three |
| `/terminal/sealed` | 404 | `feat/moon-terminal` only (local, undeployed) |
| `/articles`, `/blog`, `/games/one-piece/articles`, `/article/<slug>` | 404 | — |

**Reading:** production ≈ `codex/market-index-snapshots` (champions/franchises/promos all
404, matching that branch and not `lorcana-data-live`) **plus a News feature from
nowhere**. Note `codex/market-index-snapshots-prod` is a *different branch* from
`codex/market-index-snapshots`; the `-prod` one has champions, so it is not what is
deployed either. There are 81 remote branches — do not assume the four discussed in any
given thread are the whole set.

### Consequences

- **Grepping the repo cannot answer "does anything use this table?"** It answers "does
  anything *in git* use it." For production, probe the deployed site.
- Reconcile schema against `supabase_migrations.schema_migrations`, never against
  `ls supabase/migrations/`.
- A local `npm run build` passing says nothing about whether production has routes the
  repo lacks — or whether a schema change will collide with code we cannot see.

---

## 2. Dead grants — `anon` has no `USAGE` on schema `public`

Every `grant select … to anon` in this repository is **inert**.

Both the legacy anon key and the **current publishable key** return the same thing on
*every* table, including definitively public ones like `cards`:

```
GET /rest/v1/cards?select=id&limit=1
401  {"code":"42501","message":"permission denied for schema public"}
```

That is a Postgres error, not an API-gateway rejection. The key is accepted; the `anon`
role simply cannot enter the schema. A write probe (`POST /rest/v1/articles` with an
empty body) returns the same `42501` rather than a constraint violation — so writes are
refused at the permission layer, before RLS is ever consulted.

**There is also no client-side database path at all.** `src/lib/supabase.ts` exports a
`createBrowserClient` helper that **nothing imports**, and no `"use client"` file
references Supabase anywhere in `src/`.

### Why this will confuse someone

Migrations in this repo end with grants that read as if they enable public access:

```sql
grant select on public.pull_rates to anon, authenticated;   -- v49
grant select on public.card_character_links to anon, authenticated;   -- v47
```

Neither does anything. A future developer adding a client-side read, seeing that grant
and an RLS `for select using (true)` policy, will get `42501` and lose time looking at
RLS policies — which are not the cause.

**The correct pattern is the existing one:** all reads go through
`createCachedServiceClient()` server-side. The service role bypasses both the schema
grant and RLS. This is not a workaround; it is the architecture. See the spec's §6.

**Do not "fix" this by granting schema usage to `anon`.** Closed-by-default at the schema
level is a genuinely strong posture — it is why `articles` was never exposed despite
arriving with unknown RLS. Removing it would open every table at once.

---

## 3. `is_public` gate breach — riftbound and lorcana are publicly browsable

**Live on production right now:**

```
/games/riftbound        200
/games/riftbound/sets   200   renders real content — "Origins", "Proving Grounds"
/games/lorcana          200
/games/lorcana/sets     200
```

| game | cards | sets | `is_public` |
|---|---:|---:|---|
| one_piece | 5,053 | 53 | true |
| riftbound | 1,064 | 7 | **true** |
| lorcana | 3,226 | 18 | **true** |
| pokemon | 0 | 0 | false |

**Mechanism — this is the part worth internalising.** These pages do not need
game-specific code. `/games/[game]/sets` is a *generic* game-scoped route present on
every branch; it serves any game with `is_public = true` and catalog rows. So a game
becomes publicly browsable the moment the **database** says it is public, entirely
independent of whether the deployed build contains that game's bespoke pages.

Production 404s on `/games/one-piece/champions` — a lorcana-branch page — while happily
serving `/games/riftbound/sets`. Rolling back application code does **not** roll back
game visibility.

### `npm run audit:game-boundaries` already catches this

It fails with exactly:

```
Failures
- riftbound should remain private until launch approval
```

Structurally everything else is clean — 0 cross-game issues, 0 missing `game_id`, 0
duplicate keys. That one line is the whole failure.

**It was dismissed as pre-existing noise twice** before being traced. It was never noise:
it was accurately reporting that an unlaunched game is publicly browsable. The lesson is
narrow and worth stating plainly — *"this check was already failing before my change"*
does not mean *"this check is wrong."* An audit that fails constantly stops being read,
which is how a real breach stayed open.

### Not fixed

The remedy is one statement, but whether these games *should* be public is a product
decision, not a cleanup:

```sql
-- NOT APPLIED — Justin's call
update public.games set is_public = false where slug in ('riftbound', 'lorcana');
```

Lorcana may be intentionally live. Riftbound, per the audit's own gate, is not.

---

## Cross-references

- `docs/moon-terminal-justtcg-findings.md` §5–§8 — the DB-ahead-of-code split as it hit
  the Terminal work
- `docs/moon-terminal-sealed-spec.md` §5.1 — three branches ship three different navs
- `docs/moon-terminal-sealed-spec.md` §6 — service-role-only access rules
