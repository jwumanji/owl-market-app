import Image from "next/image";
import type { CSSProperties, ReactEventHandler } from "react";

const MIRRORED_CARD_IMAGE_PATH = "/storage/v1/object/public/card-images/";

type FetchPriority = "high" | "low" | "auto";

type FastCardImageProps = {
  alt: string;
  className?: string;
  fetchPriority?: FetchPriority;
  height: number;
  loading?: "eager" | "lazy";
  onError?: ReactEventHandler<HTMLImageElement>;
  onLoad?: ReactEventHandler<HTMLImageElement>;
  sizes?: string;
  src: string;
  style?: CSSProperties;
  width: number;
};

export function isMirroredCardImageUrl(src: string | null | undefined): src is string {
  return typeof src === "string" && src.includes(MIRRORED_CARD_IMAGE_PATH);
}

export default function FastCardImage({
  alt,
  className,
  fetchPriority = "auto",
  height,
  loading = "lazy",
  onError,
  onLoad,
  sizes,
  src,
  style,
  width,
}: FastCardImageProps) {
  if (isMirroredCardImageUrl(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        className={className}
        style={style}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      fetchPriority={fetchPriority}
      sizes={sizes}
      className={className}
      style={style}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
