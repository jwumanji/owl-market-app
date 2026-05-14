# ADR 001 - Owl Lens CV centering integration

**Status:** Accepted
**Date:** 2026-05-14

## Context

owl-market-app is the One Piece TCG market intelligence platform. It already owns card identity, pricing, inventory, admin tools, authentication, Supabase storage, and the visual system used by OWL products.

Owl Lens is the sibling product and service for card centering measurement. ADR 003 in `jwumanji/owl-lens` pivots Owl Lens away from a standalone web product and into a CV service that is consumed by owl-market-app. That keeps centering attached to cards and inventory items the user already manages here.

The Owl Lens repository owns the FastAPI CV service and its OpenAPI contract. This repository owns the user-facing centering workflow inside the existing Next.js app.

The Owl Lens contract is still mid-slice. `contracts/openapi.yaml` may be absent until the Owl Lens slice publishes it. owl-market-app can still land documentation, environment, route, and generation scaffolding in parallel, as long as contract-dependent commands fail loudly until the upstream contract exists.

## Decision

Centering ships as a feature inside owl-market-app, not as a standalone web app.

Phase 1 will add the product surface and contract pipeline, but measurement results are ephemeral. The result lives only in client component state for the active session. No database tables or writes are introduced in this slice.

The primary route is per inventory item:

```text
/admin/inventory/[id]/centering
```

This route matches the product goal: centering belongs to a user's physical card copy, not just the catalog card. Catalog card pages such as `/card/[id]` can link to centering later, but they are not the primary workflow because they are keyed by catalog card image identity and do not represent a specific owned copy.

The browser will not call Owl Lens FastAPI directly. owl-market-app will call it through a Next API proxy route:

```text
/api/centering/measure
```

That proxy route must require an authenticated user before forwarding to the CV service. Anonymous requests return `401` before any request is sent to `OWL_LENS_CV_URL`. The implementation should match the existing server-side Supabase auth patterns in `src/lib/supabase-server.ts`.

## Ownership

owl-market-app owns:

- Inventory entry points and route tree.
- Upload, processing, and results UI.
- Authentication and request authorization.
- Any future persistence of centering results.
- Generated TypeScript types consumed by this app.

Owl Lens owns:

- The FastAPI CV service.
- The centering measurement implementation.
- `contracts/openapi.yaml`.
- Deployment of the CV service, currently planned outside this repo.

## Environment

Add a server-only environment variable:

```text
OWL_LENS_CV_URL=http://localhost:8000
```

`OWL_LENS_CV_URL` is read only from server code. It must not be exposed as a `NEXT_PUBLIC_*` variable.

Contract sync also supports:

```text
OWL_LENS_LOCAL_PATH=C:\AI STACKS\Claude Code\Owl Lens
```

`OWL_LENS_LOCAL_PATH` points at a local checkout of `jwumanji/owl-lens`. It is optional and must not assume a sibling directory layout.

## Contract Pipeline

This repo keeps a local copy of the Owl Lens OpenAPI contract and generated TypeScript types:

```text
contracts/owl-lens.openapi.yaml
src/lib/owl-lens/openapi.generated.ts
```

Generation is driven by package scripts:

```text
npm run owl-lens:sync-contract
npm run owl-lens:generate-types
npm run owl-lens:check-types
```

The sync command reads the contract from:

1. `OWL_LENS_LOCAL_PATH\contracts\openapi.yaml`, when `OWL_LENS_LOCAL_PATH` is set.
2. The GitHub raw URL fallback for `jwumanji/owl-lens/main/contracts/openapi.yaml`.

If neither source exists or the fetched URL returns missing content, sync fails loudly. This is expected while Owl Lens is mid-slice.

`npm run build` must run the contract drift check before `next build`. Build should fail when the checked-in generated types do not match the checked-in contract snapshot.

## Phase 1

Phase 1 includes:

- This ADR.
- Root `AGENTS.md` guidance documenting the Owl Lens dependency.
- Environment variable documentation.
- Contract sync and type generation scaffolding.
- Placeholder centering route at `/admin/inventory/[id]/centering`.
- Inventory entry points linking to the placeholder route.

Phase 1 excludes:

- Calling the CV service.
- Proxy route implementation.
- Full upload/results workspace.
- Database persistence.

## Phase 2

Phase 2 adds the actual measurement workflow after Owl Lens publishes `contracts/openapi.yaml` and deploys the CV service.

Phase 2 should include:

- Authenticated `/api/centering/measure` proxy route.
- Upload, paste, drag/drop, processing, and result states.
- Generated-contract-backed request and response handling.
- Persisting centering measurements per inventory item.
- Inventory filters or indicators for centering grade ceiling candidates.

Persistence is intentionally deferred from Phase 1, but it remains the eventual product direction from Owl Lens ADR 003.

## Consequences

- owl-market-app becomes the frontend venue for Owl Lens centering.
- The integration depends on the Owl Lens repository for contract and CV service behavior.
- The app gains a cross-repo contract check in `npm run build`.
- The first user-facing surface is inventory-first, aligned with owned physical cards.
- The implementation can proceed in parallel with Owl Lens as long as contract-dependent pieces fail clearly until the OpenAPI file exists.
