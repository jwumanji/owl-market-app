"use client";

import { type MouseEvent, useState } from "react";
import Link from "next/link";
import { SALE_CHANNEL_LABELS } from "@/lib/sale-options";
import type { BundleInventoryItem, InventoryBundleSummary } from "./bundle-types";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  grading: "Grading",
  sale: "For Sale",
  ship: "Need Shipping",
  sold: "Sold",
};

type HoverPreview = {
  src: string;
  title: string;
  x: number;
  y: number;
  placement: "left" | "right";
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

function cardMeta(item: BundleInventoryItem) {
  return [item.card.set_code, item.card.card_number, item.graded_rating, item.certification_number ? `Cert ${item.certification_number}` : null]
    .filter(Boolean)
    .join(" / ");
}

function sampleThumbnails(items: BundleInventoryItem[]) {
  return items.filter((item) => cardImageUrl(item)).slice(0, 6);
}

function BundleCard({
  bundle,
  onPreview,
  onClearPreview,
}: {
  bundle: InventoryBundleSummary;
  onPreview: (item: BundleInventoryItem, event: MouseEvent<HTMLElement>) => void;
  onClearPreview: () => void;
}) {
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
            {bundle.items.slice(0, 6).map((item) => {
              const imageUrl = cardImageUrl(item);

              return (
                <div key={item.id} className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-3 rounded-md border border-border bg-deep p-2">
                  <div
                    className="h-16 w-12 overflow-hidden rounded-md border border-border-2 bg-surface"
                    onMouseMove={(event) => onPreview(item, event)}
                    onMouseLeave={onClearPreview}
                  >
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={cardTitle(item)} className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-1 text-center font-mono text-[9px] uppercase text-text-3">No Image</div>
                    )}
                  </div>
                  <div className="min-w-0 self-center">
                    <div className="truncate text-sm font-bold text-text">{cardTitle(item)}</div>
                    <div className="mt-1 truncate font-mono text-xs font-semibold text-owl">{cardMeta(item)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <div className="flex h-20 items-center justify-start xl:justify-end">
            {thumbnails.length > 0 ? (
              <div className="flex -space-x-2">
                {thumbnails.map((item) => (
                  <div
                    key={item.id}
                    className="h-20 w-14 overflow-hidden rounded-md border border-border-2 bg-deep"
                    onMouseMove={(event) => onPreview(item, event)}
                    onMouseLeave={onClearPreview}
                  >
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

export function BundlesList({ bundles }: { bundles: InventoryBundleSummary[] }) {
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);

  function updateHoverPreview(item: BundleInventoryItem, event: MouseEvent<HTMLElement>) {
    const imageUrl = cardImageUrl(item);
    if (!imageUrl) return;

    setHoverPreview({
      src: imageUrl,
      title: cardTitle(item),
      x: event.clientX,
      y: event.clientY,
      placement: event.clientX > window.innerWidth - 320 ? "left" : "right",
    });
  }

  return (
    <>
      {hoverPreview && (
        <div
          className="pointer-events-none fixed z-50 hidden w-56 rounded-lg border border-border-2 bg-surface p-2 shadow-2xl shadow-black/50 lg:block"
          style={{
            left: hoverPreview.x,
            top: hoverPreview.y,
            transform:
              hoverPreview.placement === "left"
                ? "translate(-100%, -35%) translateX(-18px)"
                : "translate(18px, -35%)",
          }}
        >
          <div className="overflow-hidden rounded-md border border-border bg-deep">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hoverPreview.src} alt={hoverPreview.title} className="max-h-80 w-full object-contain" />
          </div>
          <div className="mt-2 line-clamp-2 text-xs font-bold leading-snug text-text">{hoverPreview.title}</div>
        </div>
      )}

      <div className="grid gap-4">
        {bundles.map((bundle) => (
          <BundleCard
            key={bundle.id}
            bundle={bundle}
            onPreview={updateHoverPreview}
            onClearPreview={() => setHoverPreview(null)}
          />
        ))}
      </div>
    </>
  );
}
