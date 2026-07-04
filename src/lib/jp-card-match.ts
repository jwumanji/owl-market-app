// ---------------------------------------------------------------------------
// Match a Japanese (Yuyu-tei) row to our One Piece catalog card.
//
// JP card numbers share the OP05-119 format, but variants (base / parallel /
// manga / SP) collide on the same number — so the lookup key MUST include a
// variant component. We reuse the JustTCG matcher's variant-key space so JP
// parallels line up with our alt-art rows. Resolves to card_id + card_image_id
// (canonical).
// ---------------------------------------------------------------------------

import { extractVariantLabel } from "@/lib/games/one-piece";

export interface MatchCardRow {
  id: string;
  card_image_id: string | null;
  card_number: string | null;
  name: string | null;
  variant_label: string | null;
  rarity: string | null;
}

// --- variant-key helpers (mirror the JustTCG matcher's key space) ---
function variantKey(label: string | null | undefined): string {
  const n = (label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!n) return "";
  if (n === "alternateart" || n === "parallel" || n === "altart") return "altart";
  if (n === "spr") return "sp";
  return n;
}

function rarityVariantKey(rarity: string | null | undefined): string {
  const r = String(rarity ?? "").trim().toUpperCase();
  if (r === "TR") return "tr";
  if (r === "SP") return "sp";
  if (r === "MR") return "manga";
  if (r === "AA") return "altart";
  if (r === "SAR") return "superalternateart";
  return "";
}

export function cardVariantKey(
  card: Pick<MatchCardRow, "name" | "variant_label" | "rarity">
): string {
  return (
    variantKey(card.variant_label) ||
    variantKey(extractVariantLabel(card.name ?? "")) ||
    rarityVariantKey(card.rarity)
  );
}

function normNumber(n: string | null | undefined): string {
  return (n ?? "").trim().toUpperCase();
}

export interface JpMatch {
  card: MatchCardRow;
  method: "number+variant" | "number+base" | "number-only";
}

export interface JpCardMatcher {
  match(cardNumber: string, variant: string): JpMatch | null;
  size: number;
}

/**
 * Build a variant-aware matcher over our catalog cards. Preference order:
 *   1. exact (number, variantKey)         — the collision-safe path
 *   2. sole card for that number          — unambiguous
 *   3. JP base ("") → our base card       — number has variants but JP row is base
 */
export function buildJpCardMatcher(cards: MatchCardRow[]): JpCardMatcher {
  const byNumberVariant = new Map<string, MatchCardRow>();
  const byNumber = new Map<string, MatchCardRow[]>();

  for (const c of cards) {
    // EN-only matcher: JP-exclusive cards carry a "_jp_" card_image_id and must
    // never be matched as an EN variant. (Marker-based so the sync doesn't need
    // the region column, keeping it runnable before migration v45 is applied.)
    if (c.card_image_id?.includes("_jp_")) continue;
    const num = normNumber(c.card_number);
    if (!num) continue;
    const nvKey = `${num}|${cardVariantKey(c)}`;
    if (!byNumberVariant.has(nvKey)) byNumberVariant.set(nvKey, c);
    const arr = byNumber.get(num) ?? [];
    arr.push(c);
    byNumber.set(num, arr);
  }

  return {
    size: byNumber.size,
    match(cardNumber, variant) {
      const num = normNumber(cardNumber);
      if (!num) return null;

      const exact = byNumberVariant.get(`${num}|${variant}`);
      if (exact) return { card: exact, method: "number+variant" };

      const candidates = byNumber.get(num) ?? [];
      if (candidates.length === 1) return { card: candidates[0], method: "number-only" };

      if (variant === "") {
        const base = candidates.find((c) => cardVariantKey(c) === "");
        if (base) return { card: base, method: "number+base" };
      }
      return null;
    },
  };
}
