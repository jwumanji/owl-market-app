# Codex coordination — a second autonomous agent writes to this project

**Date:** 2026-07-26
**Status:** findings only. Nothing here has been fixed or applied.

This repository is worked by at least two autonomous agents. Claude sessions run from the
local working directory. **Codex** runs elsewhere: it pushes its own branches, applies
migrations directly to the production database, and deploys to production with
`vercel --prod`. It does not go through `main`, does not open PRs for its production work,
and — as §5 proves — does not always commit the code it ships.

**The one-sentence version:** neither the file list, nor the branch list, nor `main` is a
record of what production runs. Any session that assumes otherwise produces confidently
wrong answers.

> This document merges two independent investigations. Where they disagreed, the
> disagreement is resolved inline with the evidence that settled it.

---

## 1 — What Codex touches

### 1.1 Branches — 45 of 80

```bash
gh api "repos/jwumanji/owl-market-app/branches?per_page=100" --jq '.[].name' | wc -l          # 80
gh api "repos/jwumanji/owl-market-app/branches?per_page=100" --jq '.[].name' | grep -c '^codex/'  # 45
```

Named by task: `codex/article-system-release`, `codex/lorcana-data-live`,
`codex/riftbound-reconciliation`, `codex/market-index-snapshots`. Work ships to production
straight off the feature branch; it is not merged to `main` first.

Note there are ~80 branches. Do not assume the three or four discussed in any given thread
are the whole set — and note that similarly-named branches are *different*
(`codex/market-index-snapshots` vs `codex/market-index-snapshots-prod` have different
contents).

### 1.2 Production — `vercel --prod` from the CLI

Of the 60 most recent deployments, **34 are `source: cli`, and every one carries
`meta.actor = "codex"`**. The correlation is exact and is the single most useful detection
signal in this document:

| `source` | `meta.actor` | count | meaning |
|---|---|---:|---|
| `cli` | `codex` | 34 | Codex shipped it |
| `git` | `jwumanji` | 26 | GitHub-triggered build |

**The signature pattern** — Codex pushes a branch, GitHub fires a *preview* build
(attributed to `jwumanji`), then seconds later Codex runs `vercel --prod`, landing a
*production* deployment attributed to `codex`:

```
2026-07-25T19:26:37.808Z  preview     git  jwumanji  codex/lorcana-data-live@48d6439
2026-07-25T19:26:45.530Z  production  cli  codex     codex/lorcana-data-live@48d6439   ← 8s later
```

**A CLI deploy ships the working tree, not a commit.** Some report `ref = HEAD`
(`HEAD@8f9c85a`, `HEAD@340f337`) — uploaded from a detached tree. §5 shows this is not a
curiosity: production is currently serving a feature that exists in no commit anywhere.

### 1.3 Migrations — `supabase db push` from an unseen machine

`supabase/migrations/` is CLI-managed, with a populated tracking table and no `config.toml`
in the repo. The tracking table is **not reachable from an application key**:

```
GET /rest/v1/schema_migrations   Accept-Profile: supabase_migrations
→ 406  PGRST106  "Only the following schemas are exposed: public, graphql_public"
```

With direct SQL access, `supabase_migrations.schema_migrations` records
**`20260726110000`** — which exists in **no branch**. That migration created
`public.articles` (§5).

Migration files are *usually* committed afterwards (`20260723120000_market_index_snapshots`,
`20260724010000_card_image_health_audits` are on `codex/*` branches and their tables exist).
"Usually" is the problem: **the database is the source of truth, not the repo.**

---

## 2 — Timeline: when is Codex active?

Reconstructed from Vercel deployment records (`created`, `meta.actor`, `meta.gitCommitRef`)
over **2026-07-22T04:17Z → 2026-07-26T07:20Z**, 60 deployments.

### 2.1 Active hours

Deployments per hour, UTC:

```
04:00  █ 1          16:00  ███ 3
05:00  ██ 2         18:00  ████ 4
06:00  ███████ 7    19:00  ███████ 7
07:00  █████ 5      20:00  ██ 2
08:00  █████████████ 13
09:00  ██████ 6
10:00  ██████████ 10
```

| Cluster | UTC | Local (ICT, UTC+7) | Deploys |
|---|---|---|---:|
| Morning | 04:00 – 10:00 | 11:00 – 17:00 | 44 |
| Evening | 16:00 – 20:00 | 23:00 – 03:00 | 16 |

**Nothing at all** between 11:00–15:00 and 21:00–03:00 UTC. Those are the safe windows for
anything stateful. Inside the active clusters, assume production can change under you at
any moment.

### 2.2 Notable events

| When (UTC) | What |
|---|---|
| 07-22 04:17 | Last `git` production deploy from `main` before the divergence (`main@340f337`) |
| 07-22 → 07-23 | Heavy Codex activity — ~25 production CLI deploys (`riftbound-reconciliation`, `multitcg-foundation`, `riftbound-markets-parity`) |
| 07-25 18:55 | `codex/lorcana-live-republish@dafaa77` → production (cli) |
| 07-25 19:24 / 19:26 | `codex/lorcana-data-live@2a8d01a`, then `@48d6439` → production (cli) |
| 07-25 **19:51** | **`main@b0c10f1` deployed via git — reverted 27 commits of Codex production-only work** |
| 07-25 20:38:59 | `articles` rows seeded (identical `created_at` on all four) |
| 07-25 20:47 / 20:54 | `codex/market-index-snapshots@a737d24` → production (cli), twice |
| 07-26 06:10 | A Claude session promoted `dpl_FHwGXgx` back to production, verified |
| 07-26 **06:38, 07:20** | **Codex deployed `codex/article-system-release@340f337` to production twice, overwriting that promote** |

The last row is the lesson in miniature: a deliberate, verified production rollback
survived **28 minutes**.

---

## 3 — Race conditions

### 3.1 Migration race

`supabase db push` applies pending files in version order and records them in
`supabase_migrations.schema_migrations`. Two agents pushing concurrently gives you:

- **Version collisions.** Timestamp prefixes collide if both pick the same minute. The
  repo already carries duplicate *root* migration numbers (two each of v14, v22, v24, v25,
  v34, v41, v44) from exactly this failure under the older convention.
- **Interleaved application.** Your local `supabase/migrations/` does not contain Codex's
  unpushed files. Your `db push` applies only *your* pending files — against a schema
  Codex may have already changed.
- **Schema with no commit.** Proven by `20260726110000` / `articles`.

**Concrete failure:** you write a migration adding a column to a table Codex renamed forty
minutes ago. Your push fails — or worse, succeeds against a shape you did not expect.

**Before writing any migration:** reconcile against
`supabase_migrations.schema_migrations` (needs direct SQL), never against
`ls supabase/migrations/`.

### 3.2 Deploy race

The production alias is **last-writer-wins, no locking**. `vercel --prod` and the
promote/rollback API both just move a pointer.

**Proven:** a session promoted `dpl_FHwGXgx` at 06:10 after verifying 24 crons,
`/api/audit/card-images` → 401, and the lorcana cron. Codex deployed over it at 06:38 and
again at 07:20. No warning, no conflict, no record that the rollback had been deliberate.

**Worse variant — the git revert.** A deploy from `main` reverts *everything* Codex shipped
from branches, because `main` lacks all of it. At 19:51 on 07-25 this removed 27 commits
from production, including a live route (`/api/audit/card-images` began returning 404) and
the code consuming `MULTITCG_DUAL_WRITE_ENABLED` / `MULTITCG_READ_MODE` — leaving those env
vars set but pointing at nothing.

### 3.3 Cron config race

`vercel.json` ships *inside* the deployment, so **every production deploy silently rewrites
the entire cron set.** Observed cron counts across four hours on 07-25: 23 → 24 → 20 → 21 →
23 → 24. A cron you depend on can vanish because someone deployed a branch predating it.
This is also how `/api/audit/card-images` came to be scheduled against a route absent from
the then-current build.

### 3.4 Local resources

Claude sessions share the working directory and `C:\tmp`. Files there are **not yours by
default**. During this investigation a `C:\tmp\deployed-ebay-route.ts` written by another
session grew 435 → 480 lines mid-analysis and was mistaken for a capture of a deployed
build — leading to a wrong conclusion that production already contained a bug fix it never
had. **Verify any `C:\tmp` artifact against a real source before concluding from it.**

---

## 4 — Detection: run these at session start

All read-only.

### 4.1 Has production moved, and who moved it?

```
GET https://api.vercel.com/v6/deployments
      ?projectId=prj_s1au5403xk3ERsH9H1SsKaR9ALdZ
      &teamId=team_E7PuNgRyzGwto2cmIFZZcrUX
      &target=production&limit=10
Authorization: Bearer <token>
```

Read `created`, `source`, `meta.actor`, `meta.gitCommitRef`, `meta.gitCommitSha`.
**`source: cli` + `actor: codex` = Codex shipped it.**

Token lives at `%APPDATA%\com.vercel.cli\Data\auth.json`. **`expiresAt` is in seconds, not
milliseconds** — it is short-lived; run any `vercel` CLI command first to force a refresh,
or your API calls will 403 with `invalidToken`.

### 4.2 What is production actually running?

```
GET https://api.vercel.com/v9/projects/<prj>?teamId=<team>
→ .targets.production.id / .meta.gitCommitRef / .meta.gitCommitSha
→ .crons.definitions (count + paths), .crons.deploymentId, .crons.updatedAt
→ .commandForIgnoringBuildStep, .link.productionBranch
```

Diff `.crons.definitions` against the repo's `vercel.json`. They diverge routinely.

### 4.3 Does the deployed branch actually exist?

```bash
git ls-remote origin '<ref-from-4.1>'
```

**If this returns nothing, the deployment came from an unpushed local tree** and no amount
of repo reading will tell you what is running. See §5.

### 4.4 Has the database moved ahead of the repo?

```
GET <SUPABASE_URL>/rest/v1/    apikey + Authorization: Bearer <SERVICE_ROLE_KEY>
→ Object.keys(spec.paths) — every table/RPC PostgREST can see
```

Diff against tables created by `supabase/migrations/*.sql` on your branch. **A table in the
DB with no migration file anywhere is uncommitted Codex work.** This is how `articles` was
found.

### 4.5 Is a route live?

```
GET https://owl-market-app.vercel.app/api/<route>?secret=deliberately-wrong
```

`401` = present in the live build. `404` = absent. The auth check returns before any work,
so this mutates nothing. For pages, fetch the path and read the status.

**Grepping the repo cannot answer "does anything use this table?"** — it answers "does
anything *in git* use it." For production, probe the deployed site.

### 4.6 How far is production from your branch?

```bash
gh api "repos/jwumanji/owl-market-app/compare/main...<production-sha>" \
  --jq '"ahead_by=" + (.ahead_by|tostring) + " behind_by=" + (.behind_by|tostring)'
```

Never assume `main`. On 07-25 local `main` was 123 commits behind `origin/main`, and
`origin/main` was itself 27 commits behind production.

---

## 5 — The `articles` finding

### 5.1 The table

Migration **`20260726110000`** — recorded in `supabase_migrations.schema_migrations`,
present in **no branch** — created `public.articles`. A game-scoped editorial table,
15 columns:

```
id, game_id, slug, title, summary, body, category, status,
hero_image_url, hero_alt, author_name, created_by,
published_at, created_at, updated_at
```

**Four rows**, all `status: published`, all the same `game_id`
(`42f667ef-5c6d-4971-9442-bf4086ca7d95` = One Piece), all authored
`"Moon Market Editorial"`, all `created_at = 2026-07-25T20:38:59.920382Z` — one seeding
transaction:

| slug | category | published_at |
|---|---|---|
| `op16-round-one-reveals` | reveal | 2026-07-14 |
| `regional-market-movers` | market | 2026-07-11 |
| `one-piece-day-2026` | event | 2026-07-08 |
| `op16-secret-rare` | release | 2026-07-05 |

`published_at` is backdated relative to `created_at`, so this is demo/placeholder content,
not real editorial history.

**Naming note:** the table is `articles`, not `game_articles`. `game_articles` does not
exist — `GET /rest/v1/game_articles` returns `404 PGRST205`, and
`gh api "search/code?q=game_articles+repo:jwumanji/owl-market-app"` returns **0 hits**.

### 5.2 The feature is live, and its code exists in no commit

The first read was "dormant table, no consuming code." **That was wrong — and the truth is
worse.**

```
/games/one-piece/news          → 200   lists all 4 slugs and titles
/news/op16-round-one-reveals   → 307 → /games/one-piece/news/<slug> → 200
```

It even follows this repo's mirror convention — `/news` redirecting into
`/games/[game]/news`, the same pattern `/sets` and `/terminal` use.

**Where the code lives — resolved.** An earlier pass searched all remote refs for
`src/app/news/`, `src/app/games/[game]/news/`, and any file referencing `articles`, and
found zero hits, concluding production was `codex/market-index-snapshots` "plus a News
feature from nowhere." Deployment metadata settles it:

- Production is `codex/article-system-release@340f337`, deployed 07-26 at **06:38** and
  **07:20** UTC (`source: cli`, `actor: codex`).
- `git ls-remote origin '*article*'` → **nothing**. The branch does not exist on origin.
- `340f337` *is* a real commit — `Merge pull request #69 …character-discovery-release`,
  07-22T04:16:59Z — but `GET /contents/src/app?ref=340f337` contains **no news or article
  route**.
- `/games/one-piece/news` returns **200** right now.

**Conclusion:** Codex created a *local-only* branch named `codex/article-system-release` at
a four-day-old commit, built the News feature as **uncommitted working-tree changes**, and
deployed that tree. The code exists nowhere in git — only as a compiled artifact inside two
Vercel deployments. It is not "in a branch we haven't checked." It is in no branch, no
commit, and no repository.

This is the sharpest illustration of the coordination problem available: **the schema
landed ~10 hours before the code, from a machine outside this repo, and the code was never
committed at all.**

### 5.3 RLS and grants — `anon` has no `USAGE` on schema `public`

Both a SELECT and an INSERT with the anon key return:

```
401  {"code":"42501","message":"permission denied for schema public"}
```

That is a **schema-level** denial, not a table-level or RLS decision, and it is
**project-wide, not specific to `articles`**. Control probe:

| table | anon | service role |
|---|---|---|
| `articles` | `401 42501` | `206` — 4 rows |
| `cards` | `401 42501` | `206` — 9,343 rows |
| `games` | `401 42501` | `206` — 4 rows |
| `sets` | `401 42501` | `206` — 78 rows |
| `price_stats` | `401 42501` | `206` — 8,579 rows |

It is a Postgres error, not an API-gateway rejection: the key is accepted, the `anon` role
simply cannot enter the schema. The write probe returns `42501` rather than a constraint
violation, so writes are refused at the permission layer **before RLS is ever consulted**.

**Therefore RLS on `articles` cannot be determined from outside** — the schema grant denies
access before any policy evaluates. Inspecting it requires SQL (`pg_class.relrowsecurity`,
`pg_policies`), which PostgREST does not expose. What *can* be stated: `articles` is
neither more nor less exposed than any other table.

**There is also no client-side database path at all.** `src/lib/supabase.ts` exports a
`createBrowserClient` helper that nothing imports, and no `"use client"` file references
Supabase anywhere in `src/`.

#### Why this will confuse someone

Migrations end with grants that read as if they enable public access:

```sql
grant select on public.pull_rates to anon, authenticated;          -- v49
grant select on public.card_character_links to anon, authenticated; -- v47
```

**Every such grant in this repository is inert.** A developer adding a client-side read,
seeing that grant plus an RLS `for select using (true)` policy, will get `42501` and lose
time debugging RLS — which is not the cause.

**The correct pattern is the existing one:** all reads go through
`createCachedServiceClient()` server-side. The service role bypasses both the schema grant
and RLS. This is the architecture, not a workaround.

**Do not "fix" this by granting schema usage to `anon`.** Closed-by-default at the schema
level is a genuinely strong posture — it is why `articles` was never publicly exposed
despite arriving with unknown RLS. Removing it opens every table at once.

---

## 6 — Related: the `is_public` gate breach

Not a Codex-coordination issue per se, but found in the same trace and it shares the root
cause — **the database controls behaviour independently of deployed code**.

Live on production now:

```
/games/riftbound  200      /games/riftbound/sets  200   renders "Origins", "Proving Grounds"
/games/lorcana    200      /games/lorcana/sets    200
```

| game | cards | sets | `is_public` |
|---|---:|---:|---|
| one_piece | 5,053 | 53 | true |
| riftbound | 1,064 | 7 | **true** |
| lorcana | 3,226 | 18 | **true** |
| pokemon | 0 | 0 | false |

**Mechanism.** `/games/[game]/sets` is a *generic* game-scoped route present on every
branch. It serves any game with `is_public = true` and catalog rows. A game becomes
publicly browsable the moment the **database** says so — entirely independent of whether
the deployed build contains that game's bespoke pages. Production 404s on
`/games/one-piece/champions` (a lorcana-branch page) while happily serving
`/games/riftbound/sets`. **Rolling back application code does not roll back game
visibility.**

`npm run audit:game-boundaries` already catches this, failing with exactly:

```
Failures
- riftbound should remain private until launch approval
```

Everything else is structurally clean — 0 cross-game issues, 0 missing `game_id`, 0
duplicate keys. That one line is the whole failure, and **it was dismissed as pre-existing
noise twice** before being traced. It was never noise. *"This check was already failing
before my change"* does not mean *"this check is wrong."* An audit that fails constantly
stops being read, which is how a real breach stayed open.

**Not fixed** — whether these games should be public is a product decision:

```sql
-- NOT APPLIED — Justin's call
update public.games set is_public = false where slug in ('riftbound', 'lorcana');
```

Lorcana may be intentionally live. Riftbound, per the audit's own gate, is not.

---

## 7 — Working rules

1. **Never assume `main`.** Get the production branch from
   `.targets.production.meta.gitCommitRef`, then check it actually exists (§4.3).
2. **Never infer schema from the repo.** Probe PostgREST for table presence.
3. **Never infer "unused" from grep.** Probe the deployed site.
4. **Avoid stateful work during Codex's active hours** (04:00–10:00, 16:00–20:00 UTC)
   without checking §4.1 first — and re-check afterwards.
5. **A deploy is not durable.** If a rollback matters, verify it still holds later.
6. **Treat `C:\tmp` artifacts as untrusted** unless you created them this session.
7. **Blocking git deploys does not stop Codex.** It ships via CLI, which no Ignored Build
   Step or Production Branch setting affects. Those settings only constrain
   `jwumanji`'s git-triggered deploys.
8. **Coordinate before touching a `codex/*` branch that is currently deploying.**
   Concurrent edits to a live trunk are a human decision, not an agent one.
9. **A local `npm run build` passing says nothing** about whether production has routes the
   repo lacks, or whether a schema change will collide with code you cannot see.

---

## Appendix — evidence commands

| Question | Command |
|---|---|
| Who deployed production? | `GET /v6/deployments?projectId=…&target=production&limit=10` → `source`, `meta.actor` |
| What's live now? | `GET /v9/projects/<prj>?teamId=<team>` → `.targets.production` |
| Does the deployed branch exist? | `git ls-remote origin '<ref>'` — empty means unpushed working tree |
| Cron drift | `.crons.definitions` vs repo `vercel.json` |
| DB table inventory | `GET <SUPABASE_URL>/rest/v1/` with service-role key → `Object.keys(spec.paths)` |
| Table absent from git? | `gh api "search/code?q=<table>+repo:jwumanji/owl-market-app"` |
| Applied migrations | `select * from supabase_migrations.schema_migrations` — **direct SQL only**, PostgREST returns `PGRST106` |
| Branch distance | `gh api "repos/…/compare/main...<sha>"` |
| Route live? | `GET /api/<route>?secret=wrong` → 401 present / 404 gone |
| Vercel token | `%APPDATA%\com.vercel.cli\Data\auth.json`; `expiresAt` is **seconds** |

## Cross-references

- `docs/moon-terminal-justtcg-findings.md` §5–§8 — the DB-ahead-of-code split as it hit the
  Terminal work
- `docs/moon-terminal-sealed-spec.md` §5.1 — three branches ship three different navs
- `docs/moon-terminal-sealed-spec.md` §6 — service-role-only access rules

## Game visibility is flipped from outside this repo (2026-07-27)

`games.is_public` is mutated directly in the live DB by the other workstream.
Observed: `riftbound.is_public` flipped `false → true` between the Phase F and
Phase G verification sweeps (~2026-07-27) — Justin's instruction, applied out of
band, later reverted. Consequence: **`audit:game-boundaries` can regress with no
change from us** — the `riftbound should remain private until launch approval`
assertion tests live DB state, not code. Before treating that failure as a code
defect, check `games.is_public` and ask whether a visibility change was
intentional. Neither direction of a flip leaves any trace in this repo.
