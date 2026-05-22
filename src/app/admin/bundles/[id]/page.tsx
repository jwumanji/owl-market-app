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
          <Link
            href="/admin/bundles"
            className="rounded-md border border-border bg-surface px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            Back to Bundles
          </Link>
          <Link
            href="/admin/bundles/new"
            className="rounded-md bg-owl px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
          >
            Create Bundle
          </Link>
        </div>
      </div>

      {bundleResult.error || inventoryResult.error || !bundleResult.data ? (
        <div className="rounded-lg border border-owl/40 bg-owl/10 p-4 text-sm text-text">
          Inventory bundle details are not available yet. Run{" "}
          <span className="font-mono font-semibold text-owl">schema-migration-v22-inventory-bundles.sql</span> in Supabase,
          then open this bundle again.
          <div className="mt-2 font-mono text-xs text-text-2">
            {bundleResult.error ?? inventoryResult.error ?? "Bundle not found."}
          </div>
        </div>
      ) : (
        <BundleForm inventoryItems={inventoryResult.data} initialBundle={bundleResult.data} />
      )}
    </section>
  );
}
