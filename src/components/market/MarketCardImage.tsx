"use client";

import { useEffect, useMemo, useState } from "react";

import { cardImageSources, type CardImageSourceSize } from "@/lib/card-image-variants";
import CardHoverZoom from "../ui/CardHoverZoom";
import FastCardImage from "../ui/FastCardImage";

type MarketCardImageProps = {
  alt: string;
  className?: string;
  fallbackTimeoutMs?: number;
  fetchPriority?: "high" | "low" | "auto";
  height?: number;
  imageUrl?: string | null;
  imageUrlPreview?: string | null;
  imageUrlSmall?: string | null;
  loading?: "eager" | "lazy";
  sourceSize?: CardImageSourceSize;
  width?: number;
};

function cardInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default function MarketCardImage({
  alt,
  className,
  fallbackTimeoutMs = 0,
  fetchPriority = "auto",
  height,
  imageUrl,
  imageUrlPreview,
  imageUrlSmall,
  loading = "lazy",
  sourceSize = "thumbnail",
  width,
}: MarketCardImageProps) {
  const sources = useMemo(
    () => cardImageSources({ imageUrl, imageUrlPreview, imageUrlSmall }, sourceSize),
    [imageUrl, imageUrlPreview, imageUrlSmall, sourceSize],
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
    <CardHoverZoom src={src} previewSrc={imageUrlPreview ?? imageUrl ?? src} alt={alt}>
      <FastCardImage
        src={src}
        alt={alt}
        width={width ?? 64}
        height={height ?? 90}
        loading={loading}
        fetchPriority={fetchPriority}
        sizes={`${width ?? 64}px`}
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
