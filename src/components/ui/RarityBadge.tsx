const RARITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  C:   { bg: "bg-white/5",       text: "text-text-3",     border: "border-white/10" },
  UC:  { bg: "bg-white/[0.08]",  text: "text-text-2",     border: "border-white/10" },
  R:   { bg: "bg-blue/10",       text: "text-blue",       border: "border-blue/20" },
  SR:  { bg: "bg-purple/10",     text: "text-purple",     border: "border-purple/20" },
  SEC: { bg: "bg-[#E8A020]/10",  text: "text-owl",        border: "border-[#E8A020]/20" },
  L:   { bg: "bg-[#00D68F]/10",  text: "text-gain",       border: "border-[#00D68F]/20" },
  SP:  { bg: "bg-[#FF69B4]/10",  text: "text-[#FF69B4]",  border: "border-[#FF69B4]/20" },
  MR:  { bg: "bg-[#FF4560]/10",  text: "text-loss",       border: "border-[#FF4560]/20" },
  TR:  { bg: "bg-[#E8A020]/10",  text: "text-owl",        border: "border-[#E8A020]/20" },
  AA:  { bg: "bg-[#00BCD4]/10",  text: "text-[#00BCD4]",  border: "border-[#00BCD4]/20" },
};

export default function RarityBadge({ rarity }: { rarity: string | null }) {
  if (!rarity) return null;
  const s = RARITY_STYLES[rarity] ?? RARITY_STYLES["C"];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${s.bg} ${s.text} ${s.border}`}
    >
      {rarity}
    </span>
  );
}
