import Image from "next/image";

type MoonMarketLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

/** Font-independent Moon Market lockup from the approved brand bundle. */
export default function MoonMarketLogo({
  className,
  width = 155,
  height = 36,
  priority = false,
}: MoonMarketLogoProps) {
  return (
    <Image
      src="/brand/moon-lockup-paths.svg"
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
