"use client";

import { type MouseEvent, useState } from "react";
import Link from "next/link";
import { DEFAULT_PUBLIC_GAME_DB_SLUG } from "@/lib/game-scope";
import { SALE_CHANNEL_LABELS } from "@/lib/sale-options";
import type { BundleInventoryItem, InventoryBundleSummary } from "./bundle-types";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  grading: "Grading",
  sale: "For Sale",
  ship: "Need Shipping",
  sold: "Sold",
};

const STATUS_CHIP: Record<string, string> = {
  new: "border-ink-2 bg-bg-2 text-ink-2",
  grading: "border-gold bg-[#FBF0DA] text-gold",
  sale: "border-gain-2 bg-[#DCF1E6] text-gain-2",
  ship: "border-coral bg-[#FFE2DD] text-coral",
  sold: "border-ink-3 bg-bg-2 text-ink-3",
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
  gameSlug,
  onPreview,
  onClearPreview,
}: {
  bundle: InventoryBundleSummary;
  gameSlug: string;
  onPreview: (item: BundleInventoryItem, event: MouseEvent<HTMLElement>) => void;
  onClearPreview: () => void;
}) {
  const thumbnails = sampleThumbnails(bundle.items);
  const saleLabel = bundle.sale_channel ? SALE_CHANNEL_LABELS[bundle.sale_channel] : "----";
  const statusChipClass = STATUS_CHIP[bundle.status] ?? "border-ink-2 bg-bg-2 text-ink-2";

  return (
    <article className="admin-card p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-ink-2">
            Updated {formatDate(bundle.updated_at ?? bundle.created_at)}
          </div>
          <h2 className="mt-1 truncate font-grotesk text-2xl font-bold tracking-tight text-ink">
            {bundle.name}
          </h2>
          {bundle.notes && (
            <p className="mt-2 line-clamp-2 max-w-4xl font-grotesk text-sm text-ink-2">
              {bundle.notes}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-c-sm border-[1.5px] border-ink bg-bg-3 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
              Cards <span className="text-ink">{bundle.items.length}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-c-sm border-[1.5px] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider ${statusChipClass}`}
            >
              {STATUS_LABELS[bundle.status] ?? bundle.status}
            </span>
            {bundle.status === "sold" && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-c-sm border-[1.5px] border-gain-2 bg-[#DCF1E6] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-gain-2">
                  Sold At <span className="text-ink">{saleLabel}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-c-sm border-[1.5px] border-ink-3 bg-bg-2 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
                  Sold Date <span className="text-ink">{formatDate(bundle.sold_date)}</span>
                </span>
              </>
            )}
          </div>
          <div className="mt-4 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
            {bundle.items.slice(0, 6).map((item) => {
              const imageUrl = cardImageUrl(item);

              return (
                <div
                  key={item.id}
                  className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 rounded-c-sm border-[1.5px] border-ink bg-bg p-2"
                >
                  <div
                    className="h-[66px] w-12 overflow-hidden rounded border-[1.5px] border-ink bg-bg-2"
                    onMouseMove={(event) => onPreview(item, event)}
                    onMouseLeave={onClearPreview}
                  >
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={cardTitle(item)} className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-1 text-center font-mono text-[9px] uppercase text-ink-3">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-grotesk text-sm font-bold text-ink">
                      {cardTitle(item)}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10.5px] font-medium text-ink-2">
                      {cardMeta(item)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-start gap-3.5 xl:items-end">
          <div className="flex h-[74px] items-center justify-start xl:justify-end">
            {thumbnails.length > 0 ? (
              <div className="flex">
                {thumbnails.map((item, index) => (
                  <div
                    key={item.id}
                    className="h-[74px] w-[52px] overflow-hidden rounded-md border-[1.5px] border-ink bg-bg-2 shadow-[0_0_0_2.5px_var(--bg-2)]"
                    style={{ marginLeft: index === 0 ? 0 : -12 }}
                    onMouseMove={(event) => onPreview(item, event)}
                    onMouseLeave={onClearPreview}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cardImageUrl(item) ?? ""} alt={cardTitle(item)} className="h-full w-full object-contain" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-c-sm border-[1.5px] border-dashed border-ink-3 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                No Images
              </div>
            )}
          </div>
          <Link href={`/admin/bundles/${bundle.id}?game=${encodeURIComponent(gameSlug)}`} className="admin-btn admin-btn-ghost">
            View Bundle
          </Link>
        </div>
      </div>
    </article>
  );
}

export function BundlesList({
  bundles,
  gameSlug = DEFAULT_PUBLIC_GAME_DB_SLUG,
}: {
  bundles: InventoryBundleSummary[];
  gameSlug?: string;
}) {
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
          className="pointer-events-none fixed z-50 hidden w-56 rounded-c-md border-[1.5px] border-ink bg-bg-2 p-2 shadow-[0_12px_32px_rgba(26,15,8,0.18)] lg:block"
          style={{
            left: hoverPreview.x,
            top: hoverPreview.y,
            transform:
              hoverPreview.placement === "left"
                ? "translate(-100%, -35%) translateX(-18px)"
                : "translate(18px, -35%)",
          }}
        >
          <div className="overflow-hidden rounded border-[1.5px] border-ink bg-bg-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hoverPreview.src} alt={hoverPreview.title} className="max-h-80 w-full object-contain" />
          </div>
          <div className="mt-2 line-clamp-2 font-grotesk text-xs font-bold leading-snug text-ink">
            {hoverPreview.title}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {bundles.map((bundle) => (
          <BundleCard
            key={bundle.id}
            bundle={bundle}
            gameSlug={gameSlug}
            onPreview={updateHoverPreview}
            onClearPreview={() => setHoverPreview(null)}
          />
        ))}
      </div>
    </>
  );
}
