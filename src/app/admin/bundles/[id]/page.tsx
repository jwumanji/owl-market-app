import Link from "next/link";
import BundleForm from "../BundleForm";
import { loadBundleForEdit, loadBundleInventory } from "../bundle-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bundle Details - OWL Market",
};

export default async function InventoryBundleDetailPage({ params }: { params: { id: string } }) {
  const [bundleResult, inventoryResult] = await Promise.all([
    loadBundleForEdit(params.id),
    loadBundleInventory(params.id),
  ]);

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-8">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Inventory Bundle</p>
          <h1 className="admin-title">{bundleResult.data?.name ?? "Bundle Details"}</h1>
          <p className="admin-subline">
            Edit the bundle name, status, sale details, and grouped inventory items.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/bundles" className="admin-btn admin-btn-ghost">
            Back to Bundles
          </Link>
          <Link href="/admin/bundles/new" className="admin-btn admin-btn-primary">
            Create Bundle
          </Link>
        </div>
      </div>

      {bundleResult.error || inventoryResult.error || !bundleResult.data ? (
        <div className="rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          Inventory bundle details are not available yet. Run{" "}
          <span className="font-mono font-semibold text-coral">schema-migration-v22-inventory-bundles.sql</span> in Supabase,
          then open this bundle again.
          <div className="mt-2 font-mono text-xs text-ink-2">
            {bundleResult.error ?? inventoryResult.error ?? "Bundle not found."}
          </div>
        </div>
      ) : (
        <BundleForm inventoryItems={inventoryResult.data} initialBundle={bundleResult.data} />
      )}
    </section>
  );
}
