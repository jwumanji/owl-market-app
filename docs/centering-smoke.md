# Centering Smoke Suite

Run the focused Centering Tool automated smoke suite before and after changes to the inventory centering flow, standalone pre-grade flow, or centering API proxy.

```bash
npm run smoke:centering
```

The command compiles the TypeScript test files into `.tmp/centering-smoke-tests` and runs them with `node --test`. The generated files are disposable and ignored by git.

## Coverage

The smoke suite runs:

- `__tests__/components/centering-workspace.test.ts`
- `__tests__/api/centering-measure.test.ts`
- `__tests__/app/inventory-centering-page.test.ts`
- `__tests__/app/lens-pages.test.ts`
- `__tests__/app/inventory-psa10-filter.test.ts`

Together these cover the shared `CenteringWorkspace`, the `/api/centering/measure` proxy, the inventory centering route, the standalone Owl Lens pre-grade route, and the inventory PSA 10 candidate badge/filter behavior.

## External Services

The suite uses local mocks for Supabase, auth, inventory data, and Owl Lens CV responses. It should not require a live Supabase project, admin browser session, or running Owl Lens FastAPI service.

## PR Evidence

For Centering Tool PRs, paste the command and result in the PR or Linear handoff. Example:

```text
npm run smoke:centering
# passes
```
