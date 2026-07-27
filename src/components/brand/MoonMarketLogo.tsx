import Image from "next/image";

type MoonMarketLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  tone?: "light" | "dark";
  variant?: "standard" | "compact";
};

/** Moon Market subtitle lockups for standard and compact placements. */
export default function MoonMarketLogo({
  className,
  width,
  height,
  priority = false,
  tone = "light",
  variant = "standard",
}: MoonMarketLogoProps) {
  const isCompact = variant === "compact";

  return (
    <Image
      src={
        isCompact
          ? "/brand/moon-market-lockup-small-1200.png"
          : tone === "dark"
          ? "/brand/moon-market-lockup-subtitle-dark-1200.png"
          : "/brand/moon-market-lockup-subtitle-1600.png"
      }
      alt=""
      aria-hidden="true"
      className={className}
      width={width ?? 180}
      height={height ?? (isCompact ? 44 : 46)}
      priority={priority}
      unoptimized
    />
  );
}
