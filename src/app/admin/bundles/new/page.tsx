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
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Inventory Bundle</p>
          <h1 className="admin-title">Create Bundle</h1>
          <p className="admin-subline">
            Search inventory, group cards together, and keep the bundle moving through inventory as one unit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/bundles" className="admin-btn admin-btn-ghost">
            Back to Bundles
          </Link>
        </div>
      </div>

      {inventoryResult.error ? (
        <div className="rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          Inventory bundles are not ready yet. Run{" "}
          <span className="font-mono font-semibold text-coral">schema-migration-v22-inventory-bundles.sql</span> in Supabase,
          then create a bundle again.
          <div className="mt-2 font-mono text-xs text-ink-2">{inventoryResult.error}</div>
        </div>
      ) : (
        <BundleForm inventoryItems={inventoryResult.data} initialSelectedIds={initialSelectedIds} />
      )}
    </section>
  );
}
