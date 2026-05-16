import Link from "next/link";
import { BundlesList } from "./BundlesList";
import { loadBundleSummaries } from "./bundle-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory Bundles - OWL Market",
};

function searchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InventoryBundlesPage({
  searchParams,
}: {
  searchParams?: { created?: string | string[] };
}) {
  const { data: bundles, error } = await loadBundleSummaries();
  const createdBundleName = searchParamValue(searchParams?.created);

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Tool</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">Inventory Bundles</h1>
          <p className="mt-2 max-w-3xl text-base text-text">
            Manage permanent card groups that should stay together and move through inventory as one bundle.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/inventory"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            Back to Inventory
          </Link>
          <Link
            href="/admin/bundles/new"
            className="rounded-md bg-owl px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
          >
            Create Bundle
          </Link>
        </div>
      </div>

      {createdBundleName && (
        <div className="mb-5 rounded-lg border border-gain/40 bg-gain/10 p-4 text-sm font-semibold text-text">
          Bundle created: <span className="font-bold text-gain">{createdBundleName}</span>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg border border-owl/40 bg-owl/10 p-4 text-sm text-text">
          Inventory bundles are not ready yet. Run{" "}
          <span className="font-mono font-semibold text-owl">schema-migration-v22-inventory-bundles.sql</span> in Supabase,
          then come back here.
          <div className="mt-2 font-mono text-xs text-text-2">{error}</div>
        </div>
      )}

      {!error && bundles.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-text-2">
          No inventory bundles have been created yet.
        </div>
      )}

      {!error && bundles.length > 0 && (
        <BundlesList bundles={bundles} />
      )}
    </section>
  );
}
