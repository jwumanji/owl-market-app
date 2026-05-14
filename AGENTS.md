# AGENTS.md

This file teaches AI coding agents how to work on **owl-market-app**. Read it before making changes.

> Warning: **This is NOT the Next.js you know.** Do not rely on memory for framework behavior. Before writing or changing Next.js framework code, verify against the installed version in this repo. Prefer local installed docs at `node_modules/next/dist/docs/` when present; this checkout currently does not include that path, so inspect the installed package, types, and deprecation notices instead of guessing.
>
> Tailwind is also version-sensitive. This repo currently uses Tailwind v3 with `tailwind.config.ts`, `postcss.config.mjs`, and `@tailwind base/components/utilities` in `src/app/globals.css`. Do not apply Tailwind v4 assumptions here unless `package.json` changes. If this repo moves to Tailwind v4, expect the v4 pattern: no `tailwind.config.js`, `@import "tailwindcss"`, and `@theme inline`.

> Read [docs/adr/001-owl-lens-centering-integration.md](./docs/adr/001-owl-lens-centering-integration.md) before centering work. It records the ownership split between this app and the Owl Lens CV service.

---

## What this repo is

owl-market-app is the **One Piece TCG market intelligence platform**. It owns pricing, card catalog surfaces, set and rarity views, inventory management, PSA/admin workflows, orders, authentication, and the OWL visual system.

Sibling product **Owl Lens** provides card centering measurement. Per ADR 001 in this repo, centering is embedded here as a feature of owl-market-app. The CV pipeline lives in [`jwumanji/owl-lens`](https://github.com/jwumanji/owl-lens); this repo owns the user-facing integration.

## Repo scope

**This repo owns:**

- Next.js App Router UI and API routes under `src/app`.
- Shared UI components under `src/components`.
- Supabase, JustTCG, inventory, PSA import, and utility helpers under `src/lib`.
- Supabase schema and migration SQL files at the repo root.
- Owl Lens centering UX, inventory entry points, API proxy, generated contract types, and future measurement persistence.

**This repo does NOT own:**

- The Owl Lens CV implementation.
- The Owl Lens FastAPI deployment.
- The canonical Owl Lens OpenAPI contract.
- OpenCV/card-detection internals.

---

## Stack & versions

`package.json` is the source of truth for dependency versions. Do not pin patch versions in prose; check the file before changing framework behavior.

Current major pieces:

- Next.js 14 App Router
- React 18
- TypeScript 5
- Tailwind CSS 3
- Supabase SSR and Supabase JS
- Chart.js and react-chartjs-2
- justtcg-js
- ESLint 8 with `eslint-config-next`

Config files currently present:

- `.eslintrc.json` extends `next/core-web-vitals` and `next/typescript`.
- `next.config.mjs` is currently empty.
- `tailwind.config.ts` defines OWL color/font tokens from CSS variables.
- `postcss.config.mjs` loads Tailwind.
- `tsconfig.json` defines the `@/*` alias to `src/*`.

---

## Layout

```text
src/app/          App Router pages and route handlers
src/app/admin/    Inventory, PSA submissions, orders, and internal admin pages
src/app/api/      Next API routes for market data, sync jobs, admin operations, and card lookup
src/app/card/     Catalog card detail page keyed by card_image_id
src/app/sets/     Set list and set detail surfaces
src/app/markets/  Market dashboard pages
src/components/   Shared layout, market, and UI components
src/lib/          Supabase clients, auth helpers, inventory helpers, JustTCG, PSA import, utilities
docs/adr/         Architecture decision records
scripts/          Repo scripts and audit/sync utilities
public/           Static assets
```

Important local files:

- `middleware.ts` protects `/admin/*` and `/api/admin/*` using Supabase SSR auth and the admin email allowlist.
- `src/lib/supabase-server.ts` creates the server-side Supabase service-role client and validates required env vars.
- `src/app/admin/inventory/InventoryTabs.tsx` is the main inventory table/detail workflow and is large; keep edits targeted.
- `src/app/admin/inventory/new/NewInventoryForm.tsx` owns manual/catalog inventory creation and scan upload inputs.
- `src/lib/inventory-scans.ts` owns Supabase storage upload behavior for inventory scans.

---

## Commands

From `package.json`:

```powershell
npm run dev      # next dev
npm run build    # next build; Owl Lens drift-check wiring is deferred to Phase 2
npm run start    # next start
npm run lint     # next lint
```

Use the script names rather than invoking framework binaries directly unless you are debugging the toolchain itself.

---

## Conventions

- **Conventional commits.** Use clear scopes where useful, for example `docs(adr):`, `chore:`, `feat(centering):`, `fix(inventory):`.
- **Atomic commits with tests/checks.** Each commit should be coherent and should include relevant validation in the same commit. Do not bundle unrelated cleanup with feature work.
- **Respect dirty worktrees.** This repo often has generated reports, logs, or user edits. Stage only the files required for the current commit.
- **Source of truth first.** Check `package.json`, local config files, schema migrations, and existing route/component patterns before introducing new abstractions.
- **Line endings.** There is currently no `.gitattributes`; do not claim LF enforcement. Avoid line-ending churn, and add a `.gitattributes` policy explicitly if the project decides to enforce one.
- **Privacy for card images.** Do not log image bytes, base64 payloads, or sensitive scan contents. Centering uploads should be transient unless a future persistence ADR/phase explicitly adds storage.

---

## Owl Lens CV integration

Centering is a feature of **this** repo. The CV pipeline lives in `jwumanji/owl-lens`, a separate repository.

Integration rules from [ADR 001](./docs/adr/001-owl-lens-centering-integration.md):

- The primary centering surface is inventory-first: `/admin/inventory/[id]/centering`.
- The browser must never call the Owl Lens FastAPI service directly.
- This app calls the deployed CV service through a Next API proxy route.
- `OWL_LENS_CV_URL` is server-only. Do not expose it as `NEXT_PUBLIC_OWL_LENS_CV_URL`.
- The proxy route must reject anonymous requests with `401` before forwarding to `OWL_LENS_CV_URL`.
- TypeScript contract types are generated from Owl Lens `contracts/openapi.yaml`.
- The contract pipeline is `owl-lens:sync-contract`, `owl-lens:generate-types`, and `owl-lens:check-types`.
- Once the upstream contract is published and generated types are committed, `npm run build` will run `owl-lens:check-types` first. See Phase 2 in ADR 001.
- Phase 1 is ephemeral: measurement results live in component state only, with no DB writes.
- Persisting measurements per inventory item is a Phase 2 goal.

Contract sync must support `OWL_LENS_LOCAL_PATH` for local Owl Lens checkouts. Do not assume `../owl-lens`; on this machine the local path may be `C:\AI STACKS\Claude Code\Owl Lens`. If the local path is not set, the sync script falls back to the GitHub raw URL for `jwumanji/owl-lens/main/contracts/openapi.yaml` and fails loudly while that upstream file is absent.

---

## Quality bar

Before pushing code changes:

- [ ] `npm run lint` passes, or you document why it could not be run.
- [ ] `npm run build` passes when the slice is expected to build.
- [ ] If Owl Lens contract files changed: run the sync/generate/check pipeline and commit generated output with the contract snapshot.
- [ ] New behavior has focused validation in the same commit when practical.
- [ ] API routes that touch admin or centering behavior enforce existing Supabase auth patterns.
- [ ] No unrelated generated reports, logs, or local edits are staged.

There is currently no `.pre-commit-config.yaml` and no `.husky/` directory. Quality checks are manual through npm scripts for now. Adding a hook framework is an open project decision, not an existing repo requirement.

---

## First-contact reading order

1. `docs/adr/001-owl-lens-centering-integration.md` for centering ownership and phase boundaries.
2. `package.json` for framework versions and scripts.
3. `middleware.ts` and `src/lib/supabase-server.ts` before auth-sensitive server work.
4. The nearest existing route/component in `src/app`, `src/components`, or `src/lib` before adding new structure.
5. Owl Lens `contracts/openapi.yaml` when working on generated types or the CV proxy.
