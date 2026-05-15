import Link from "next/link";
import { SALE_CHANNEL_LABELS } from "@/lib/sale-options";
import { loadBundleSummaries } from "./bundle-data";
import type { BundleInventoryItem, InventoryBundleSummary } from "./bundle-types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory Bundles - OWL Market",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  grading: "Grading",
  sale: "For Sale",
  ship: "Need Shipping",
  sold: "Sold",
};

function formatDate(value?: string | null) {
  if (!value) return "No date";
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function cardTitle(item: BundleInventoryItem) {
  return item.item_nickname || item.card.name || "Untitled inventory item";
}

function cardImageUrl(item: BundleInventoryItem) {
  return item.custom_image_front_url ?? item.card.image_url_small ?? item.card.image_url;
}

function sampleThumbnails(items: BundleInventoryItem[]) {
  return items.filter((item) => cardImageUrl(item)).slice(0, 6);
}

function BundleCard({ bundle }: { bundle: InventoryBundleSummary }) {
  const thumbnails = sampleThumbnails(bundle.items);
  const saleLabel = bundle.sale_channel ? SALE_CHANNEL_LABELS[bundle.sale_channel] : "----";

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">
            Updated {formatDate(bundle.updated_at ?? bundle.created_at)}
          </div>
          <h2 className="mt-1 truncate text-2xl font-bold text-owl">{bundle.name}</h2>
          {bundle.notes && <p className="mt-2 line-clamp-2 max-w-4xl text-sm text-text-2">{bundle.notes}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-md border border-blue/40 bg-blue/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-blue">
              Cards <span className="text-text">{bundle.items.length}</span>
            </span>
            <span className="rounded-md border border-owl/40 bg-owl/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-owl">
              {STATUS_LABELS[bundle.status] ?? bundle.status}
            </span>
            {bundle.status === "sold" && (
              <>
                <span className="rounded-md border border-gain/40 bg-gain/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-gain">
                  Sold At <span className="text-text">{saleLabel}</span>
                </span>
                <span className="rounded-md border border-border bg-deep px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-text-2">
                  Sold Date <span className="text-text">{formatDate(bundle.sold_date)}</span>
                </span>
              </>
            )}
          </div>
          <div className="mt-4 grid max-w-5xl gap-2 md:grid-cols-2 xl:grid-cols-3">
            {bundle.items.slice(0, 6).map((item) => (
              <div key={item.id} className="min-w-0 rounded-md border border-border bg-deep px-3 py-2">
                <div className="truncate text-sm font-bold text-text">{cardTitle(item)}</div>
                <div className="mt-1 truncate font-mono text-xs font-semibold text-owl">
                  {[item.card.set_code, item.card.card_number, item.graded_rating, item.certification_number ? `Cert ${item.certification_number}` : null]
                    .filter(Boolean)
                    .join(" / ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <div className="flex h-20 items-center justify-start xl:justify-end">
            {thumbnails.length > 0 ? (
              <div className="flex -space-x-2">
                {thumbnails.map((item) => (
                  <div key={item.id} className="h-20 w-14 overflow-hidden rounded-md border border-border-2 bg-deep">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cardImageUrl(item) ?? ""} alt={cardTitle(item)} className="h-full w-full object-contain" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-4 py-3 font-mono text-xs uppercase tracking-wider text-text-2">
                No Images
              </div>
            )}
          </div>
          <Link
            href={`/admin/bundles/${bundle.id}`}
            className="rounded-md border border-owl bg-owl/10 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-owl transition-colors hover:bg-owl/15"
          >
            View Bundle
          </Link>
        </div>
      </div>
    </article>
  );
}

export default async function InventoryBundlesPage() {
  const { data: bundles, error } = await loadBundleSummaries();

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
        <div className="grid gap-4">
          {bundles.map((bundle) => (
            <BundleCard key={bundle.id} bundle={bundle} />
          ))}
        </div>
      )}
    </section>
  );
}
