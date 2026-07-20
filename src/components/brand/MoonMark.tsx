import Image from "next/image";

type MoonMarkProps = {
  size?: number;
  className?: string;
};

/** Standalone Moon Market mark for compact placements. */
export default function MoonMark({ size = 36, className }: MoonMarkProps) {
  return (
    <Image
      src="/brand/moon-mark.svg"
      alt=""
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      unoptimized
    />
  );
}
