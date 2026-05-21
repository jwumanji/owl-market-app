const RARITY_CLASS: Record<string, string> = {
  C: "c-rar-c",
  UC: "c-rar-uc",
  R: "c-rar-r",
  L: "c-rar-l",
  SR: "c-rar-sr",
  AA: "c-rar-aa",
  TR: "c-rar-tr",
  MR: "c-rar-mr",
  SP: "c-rar-sp",
  SEC: "c-rar-sec",
  GMR: "c-rar-gmr",
  SAR: "c-rar-sar",
  PROMO: "c-rar-promo",
  SEALED: "c-rar-sealed",
};

export default function RarityBadge({ rarity }: { rarity: string | null }) {
  if (!rarity) return null;
  const variant = RARITY_CLASS[rarity] ?? "c-rar-c";
  return <span className={`c-rar ${variant}`}>{rarity}</span>;
}
