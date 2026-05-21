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

const GRADIENT_RARITIES = new Set(["MR", "SP", "SEC", "GMR", "SAR"]);

export default function RarityBadge({ rarity }: { rarity: string | null }) {
  if (!rarity) return null;
  const variant = RARITY_CLASS[rarity] ?? "c-rar-c";
  const useGradient = GRADIENT_RARITIES.has(rarity);
  return (
    <span className={`c-rar ${variant}`}>
      {useGradient ? <span>{rarity}</span> : rarity}
    </span>
  );
}
