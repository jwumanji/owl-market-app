import Link from "next/link";
import BundleForm from "../BundleForm";
import { loadBundleInventory } from "../bundle-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create Bundle - OWL Market",
};

function selectedInventoryIds(searchParams?: { items?: string | string[] }) {
  const raw = Array.isArray(searchParams?.items) ? searchParams?.items.join(",") : searchParams?.items ?? "";
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
}

export default async function NewInventoryBundlePage({
  searchParams,
}: {
  searchParams?: { items?: string | string[] };
}) {
  const inventoryResult = await loadBundleInventory();
  const initialSelectedIds = selectedInventoryIds(searchParams);

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Inventory Bundle</p>
          <h1 className="text-4xl font-bold tracking-tight text-text">Create Bundle</h1>
          <p className="mt-2 max-w-3xl text-base text-text">
            Search inventory, group cards together, and keep the bundle moving through inventory as one unit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/bundles"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            Back to Bundles
          </Link>
        </div>
      </div>

      {inventoryResult.error ? (
        <div className="rounded-lg border border-owl/40 bg-owl/10 p-4 text-sm text-text">
          Inventory bundles are not ready yet. Run{" "}
          <span className="font-mono font-semibold text-owl">schema-migration-v22-inventory-bundles.sql</span> in Supabase,
          then create a bundle again.
          <div className="mt-2 font-mono text-xs text-text-2">{inventoryResult.error}</div>
        </div>
      ) : (
        <BundleForm inventoryItems={inventoryResult.data} initialSelectedIds={initialSelectedIds} />
      )}
    </section>
  );
}
