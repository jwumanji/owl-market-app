import Image from "next/image";

type MoonMarketLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  tone?: "light" | "dark";
};

/** Moon Market lockup with the "TCG Market Intelligence" subtitle. */
export default function MoonMarketLogo({
  className,
  width = 180,
  height = 46,
  priority = false,
  tone = "light",
}: MoonMarketLogoProps) {
  return (
    <Image
      src={
        tone === "dark"
          ? "/brand/moon-market-lockup-subtitle-dark-1200.png"
          : "/brand/moon-market-lockup-subtitle-1600.png"
      }
      alt=""
      aria-hidden="true"
      className={className}
      width={width}
      height={height}
      priority={priority}
      unoptimized
    />
  );
}
