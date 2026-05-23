import Link from "next/link";
import { BundlesList } from "./BundlesList";
import { loadBundleSummaries } from "./bundle-data";
import { DEFAULT_PUBLIC_GAME_DB_SLUG } from "@/lib/game-scope";

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
  searchParams?: { created?: string | string[]; game?: string | string[] } | Promise<{ created?: string | string[]; game?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const gameSlug = searchParamValue(resolvedSearchParams?.game) || DEFAULT_PUBLIC_GAME_DB_SLUG;
  const encodedGameSlug = encodeURIComponent(gameSlug);
  const { data: bundles, error } = await loadBundleSummaries(gameSlug);
  const createdBundleName = searchParamValue(resolvedSearchParams?.created);

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-8">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Internal Tool</p>
          <h1 className="admin-title">Inventory Bundles</h1>
          <p className="admin-subline">
            Manage permanent card groups that should stay together and move through inventory as one bundle.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/inventory?game=${encodedGameSlug}`} className="admin-btn admin-btn-ghost">
            Back to Inventory
          </Link>
          <Link href={`/admin/bundles/new?game=${encodedGameSlug}`} className="admin-btn admin-btn-primary">
            Create Bundle
          </Link>
        </div>
      </div>

      {createdBundleName && (
        <div className="mb-5 rounded-c-md border-[1.5px] border-gain-2 bg-[#DCF1E6] px-4 py-3 font-grotesk text-sm font-semibold text-ink">
          Bundle created: <span className="font-bold text-gain-2">{createdBundleName}</span>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          Inventory bundles are not ready yet. Run{" "}
          <span className="font-mono font-semibold text-coral">schema-migration-v22-inventory-bundles.sql</span> in Supabase,
          then come back here.
          <div className="mt-2 font-mono text-xs text-ink-2">{error}</div>
        </div>
      )}

      {!error && bundles.length === 0 && (
        <div className="rounded-c-md border-[1.5px] border-dashed border-ink-3 bg-bg-2 p-10 text-center font-grotesk text-sm text-ink-2">
          No inventory bundles have been created yet.
        </div>
      )}

      {!error && bundles.length > 0 && (
        <BundlesList bundles={bundles} gameSlug={gameSlug} />
      )}
    </section>
  );
}
