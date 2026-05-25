"use client";

import { useEffect, useMemo, useState } from "react";

import CardHoverZoom from "../ui/CardHoverZoom";

type MarketCardImageProps = {
  alt: string;
  className?: string;
  fallbackTimeoutMs?: number;
  height?: number;
  imageUrl?: string | null;
  imageUrlSmall?: string | null;
  loading?: "eager" | "lazy";
  width?: number;
};

function cardInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default function MarketCardImage({
  alt,
  className,
  fallbackTimeoutMs = 0,
  height,
  imageUrl,
  imageUrlSmall,
  loading = "lazy",
  width,
}: MarketCardImageProps) {
  const sources = useMemo(
    () => [imageUrl, imageUrlSmall].filter((src): src is string => Boolean(src)),
    [imageUrl, imageUrlSmall],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const src = sources[sourceIndex] ?? null;

  useEffect(() => {
    setSourceIndex(0);
    setLoadedSource(null);
  }, [sources]);

  useEffect(() => {
    if (!src || loadedSource === src || fallbackTimeoutMs <= 0) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      if (loadedSource !== src) {
        setSourceIndex((current) => (current === sourceIndex ? current + 1 : current));
      }
    }, fallbackTimeoutMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [fallbackTimeoutMs, loadedSource, sourceIndex, src]);

  if (!src) {
    return (
      <div
        aria-hidden="true"
        className={`${className ?? ""} flex items-center justify-center bg-bg-3 text-center font-mono-2 text-xs font-bold text-ink-2`}
        style={{ height, width }}
      >
        {cardInitial(alt)}
      </div>
    );
  }

  return (
    <CardHoverZoom src={src} alt={alt}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        className={className}
        onLoad={() => {
          setLoadedSource(src);
        }}
        onError={() => {
          setLoadedSource(null);
          setSourceIndex((current) => current + 1);
        }}
      />
    </CardHoverZoom>
  );
}
