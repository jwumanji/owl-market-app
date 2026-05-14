"use client";

import { useCallback, useRef, useState } from "react";
import { getSetImageUrl } from "./set-images";

type Variant = "table" | "headline";

const SIZE: Record<Variant, { w: number; h: number; cls: string; placeholderCls: string }> = {
  table:    { w: 52, h: 36, cls: "sv2-thumb",        placeholderCls: "sv2-thumb-placeholder" },
  headline: { w: 64, h: 44, cls: "sets-v2-hl-thumb", placeholderCls: "sets-v2-hl-thumb-placeholder" },
};

/**
 * Booster-box thumbnail with an on-hover larger preview.
 *
 * The preview is rendered via position:fixed (anchored to the thumbnail's
 * getBoundingClientRect()) so it escapes the table's overflow:hidden wrap.
 * No preview is shown for sets that lack an image — the placeholder letter
 * stays as-is.
 */
export default function SetThumb({
  slug,
  code,
  color,
  variant = "table",
}: {
  slug: string;
  code: string;
  color: string;
  variant?: Variant;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; flipLeft: boolean } | null>(null);
  const imgUrl = getSetImageUrl(slug);
  const sz = SIZE[variant];

  const showPreview = useCallback(() => {
    if (!imgUrl || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const PREVIEW_W = 232;
    const PAD = 10;
    // Prefer right side; flip to left when the right side would overflow.
    const rightEdge = r.right + PAD + PREVIEW_W;
    const flipLeft = rightEdge > window.innerWidth - 12;
    setPos({ x: flipLeft ? r.left - PAD : r.right + PAD, y: r.top + r.height / 2, flipLeft });
  }, [imgUrl]);

  const hidePreview = useCallback(() => setPos(null), []);

  return (
    <>
      <span
        ref={ref}
        className={sz.cls}
        style={{ ["--thumb-color" as string]: color } as React.CSSProperties}
        onMouseEnter={showPreview}
        onMouseLeave={hidePreview}
        onFocus={showPreview}
        onBlur={hidePreview}
      >
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt={`${code} box art`} loading="lazy" />
        ) : (
          <span className={sz.placeholderCls} aria-hidden>
            {code.replace(/[0-9]/g, "")[0] ?? "·"}
          </span>
        )}
      </span>
      {pos && imgUrl && (
        <div
          className={`sv2-thumb-preview ${pos.flipLeft ? "flip-left" : ""}`}
          style={{ left: pos.x, top: pos.y }}
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgUrl} alt="" />
          <div className="sv2-thumb-preview-caption">
            <span className="sv2-thumb-preview-code">{code}</span>
          </div>
        </div>
      )}
    </>
  );
}
