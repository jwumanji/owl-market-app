"use client";

import { useCallback, useRef, useState } from "react";

const PREVIEW_W = 200;
const PREVIEW_H = 280;
const GAP = 8;
const VIEWPORT_PAD = 8;

interface Props {
  src: string | null;
  alt: string;
  children: React.ReactNode;
  previewSrc?: string | null;
}

export default function CardHoverZoom({ src, alt, children, previewSrc }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const zoomSrc = previewSrc ?? src;

  const show = useCallback(() => {
    if (!zoomSrc) return;
    const el = wrapRef.current;
    if (!el) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(hover: none)").matches) return;

    const r = el.getBoundingClientRect();
    let left = r.right + GAP;
    if (left + PREVIEW_W > window.innerWidth - VIEWPORT_PAD) {
      left = Math.max(VIEWPORT_PAD, r.left - GAP - PREVIEW_W);
    }
    let top = r.top + r.height / 2 - PREVIEW_H / 2;
    top = Math.max(
      VIEWPORT_PAD,
      Math.min(top, window.innerHeight - PREVIEW_H - VIEWPORT_PAD),
    );
    setPos({ left, top });
  }, [zoomSrc]);

  const hide = useCallback(() => setPos(null), []);

  return (
    <span
      ref={wrapRef}
      className="c-hzoom-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {zoomSrc && pos && (
        <span
          className="c-hzoom-pop"
          style={{ left: pos.left, top: pos.top }}
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomSrc} alt={alt} loading="lazy" decoding="async" />
        </span>
      )}
    </span>
  );
}
