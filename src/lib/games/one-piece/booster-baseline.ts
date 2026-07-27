// ---------------------------------------------------------------------------
// Booster-baseline population classifier — One Piece (D7 decision 1).
//
// THE single definition of which cards under a `printed_set_code` population
// are actually obtainable from that set's booster boxes. Shared by:
//   · Box EV rarity averages   (spec §3.5, src/app/terminal/sealed/[productSlug])
//   · the §3.4 top-10 tiles + share figures (same loader)
//   · the future set-value v2 series (metric_version=2 — the parallel
//     booster-baseline rollup recommended by value-ratio-population-audit.md §7)
// Do NOT fork this rule per surface: Box EV and Value Ratio v2 need the
// identical population or their ratios stop being comparable.
//
// THE RULE — a card is EXCLUDED from the booster baseline when any of:
//   1. card_image_id starts with "P-"                      (promo ids — ~94% of
//      the polluted value, value-ratio-population-audit.md §1)
//   2. card_image_id contains an event/venue id marker     (EVENT_ID_MARKERS —
//      prize/tournament/venue distributions carrying the set's printed code)
//   3. rarity is "PR"                                      (promos by class —
//      pull-rates-research.md §5: "not pulled from boosters")
//   4. rarity is R/UC/C AND the card is not vanilla bulk:
//      the id carries a "_p" parallel suffix, or the name carries a
//      variant/venue name marker (BULK_NAME_MARKERS — catches plain-id leaks
//      like OP06-047 "Charlotte Pudding (SP)" classed R, and the OP03/OP14
//      "(Dash Pack)" event cards; sensitivity appendix §S.2–S.4)
//   5. card_image_id is on the curated exclusion list      (known plain-id
//      polluted rows string rules cannot reach — e.g. OP04-015 at $201 where
//      the honest OP04 bulk average is ~$0.13; appendix §S.3)
//
// Everything else is INCLUDED. Deliberately NOT excluded:
//   · "_r*" reprint ids — reprint variants of booster cards; the draft's §8.2
//     accepts them as a conservative approximation (they trade in pennies for
//     bulk and BELOW originals for MR classes).
//   · "_p*" / "_sp_*" ids in HIT classes (L, SR, AA, MR, SP, …) — parallels
//     with hit rarities are chase pulls; only base-rarity (R/UC/C) parallels
//     are excluded, because they are chase/topper paper that the ~271-card
//     BULK multiplier would otherwise amplify (§S.2).
//
// Matching is explicit startsWith/includes ONLY — never regex catch-alls
// (CLAUDE.md §8). Markers below are probed against the live catalog
// (2026-07-27, Phase G): every entry is evidenced, none are speculative.
// The string approach is known to age worse than a flag column (audit §7);
// when a curated flag lands, this module is the one place to swap it in.
// ---------------------------------------------------------------------------

/** Rarity codes the BULK slot aggregates (spec §3.5). */
export const BULK_RARITY_CODES = ["R", "UC", "C"] as const;

const BULK_RARITY_SET: ReadonlySet<string> = new Set(BULK_RARITY_CODES);

/**
 * Event/venue id markers. First nine are the sensitivity appendix §S.4 list;
 * the rest were found leaking through it during the Phase G live-catalog sweep
 * (e.g. OP03-116-event-pack, OP07-113-illustration-box, OP06-101-beginners-
 * deck-party, OP09-029-convention-promo, OP11-106-official-playmat,
 * OP02-008-st15-reprint).
 */
export const EVENT_ID_MARKERS = [
  "-winner-pack",
  "-regional-prize",
  "-championship-prize",
  "-cs-pack",
  "-judge-pack",
  "-premium-card-collection",
  "-welcome-pack",
  "-learn-together",
  "-other",
  "-event-pack",
  "-tournament-pack",
  "-beginners-deck-party",
  "-illustration-box",
  "-convention-promo",
  "-official-playmat",
  "-st15-reprint",
  // Final-acceptance sweep (terminal-final-acceptance.md): hit-class rarities
  // bypass the R/UC/C rule, so product-origin ids need their own markers.
  // Evidenced live: OP09-001-magazine-promo (L $159), OP09-061-special-edition
  // jumbo (L $150), OP09-051-anniversary-set (MR $1,582), OP07-051-alt-art-promo
  // (AA $142). None of these are pulled from boosters.
  "-magazine-promo",
  "-special-edition",
  "-anniversary-set",
  "-alt-art-promo",
] as const;

/**
 * Name markers that disqualify a base-rarity (R/UC/C) card from vanilla bulk.
 * These catch plain-id leaks the id markers cannot see. Evidenced live:
 * "(SP)" → OP06-047 $84 classed R; "(Dash Pack)" → OP03-070/-081/-050/-032,
 * OP14-087; "(Pirate Foil)" → OP10-018; "Box Topper" from the original audit
 * rule. The venue families are defensive twins of EVENT_ID_MARKERS for the
 * day one ships with a plain id, as EB01-003's regional-prize card once did.
 */
export const BULK_NAME_MARKERS = [
  "Box Topper",
  "(SP)",
  "(Dash Pack)",
  "(Pirate Foil)",
  "(Tournament Pack",
  "(Winner Pack",
  "(Treasure Cup",
  "(Illustration Box",
  "(Convention Promo",
  "(Official Playmat",
  "(Participation Pack",
  "(Online Regional",
  "(Offline Regional",
] as const;

/**
 * Known polluted rows with plain ids that no string rule can reach.
 * Each entry documents why it is here. Curated, not inferred.
 */
export const CURATED_EXCLUDED_CARD_IMAGE_IDS: ReadonlyMap<string, string> =
  new Map([
    [
      "OP04-015",
      "Polluted price row: $201 on a plain-id base R (honest OP04 bulk avg " +
        "~$0.13). Named in the D7 brief; sensitivity appendix §S.3/S.4.",
    ],
  ]);

export type BoosterBaselineExclusionReason =
  | "promo-id"
  | "event-id"
  | "pr-rarity"
  | "base-rarity-parallel"
  | "base-rarity-variant-name"
  | "curated-exclusion";

export type BoosterBaselineCard = {
  /** Canonical unique key (CLAUDE.md §8) — required. */
  cardImageId: string;
  /** cards.name — used only for the base-rarity name-marker rule. */
  name?: string | null;
  /** game_rarities code as stored on cards.rarity. */
  rarity?: string | null;
};

export type BoosterBaselineVerdict = {
  included: boolean;
  reason: BoosterBaselineExclusionReason | null;
};

/** Full verdict — use when the caller needs the exclusion reason (promo callouts). */
export function classifyBoosterBaseline(
  card: BoosterBaselineCard
): BoosterBaselineVerdict {
  const id = card.cardImageId;
  const rarity = card.rarity ?? "";
  const name = card.name ?? "";

  if (id.startsWith("P-")) {
    return { included: false, reason: "promo-id" };
  }
  for (const marker of EVENT_ID_MARKERS) {
    if (id.includes(marker)) {
      return { included: false, reason: "event-id" };
    }
  }
  if (rarity === "PR") {
    return { included: false, reason: "pr-rarity" };
  }
  if (BULK_RARITY_SET.has(rarity)) {
    if (id.includes("_p")) {
      return { included: false, reason: "base-rarity-parallel" };
    }
    for (const marker of BULK_NAME_MARKERS) {
      if (name.includes(marker)) {
        return { included: false, reason: "base-rarity-variant-name" };
      }
    }
  }
  if (CURATED_EXCLUDED_CARD_IMAGE_IDS.has(id)) {
    return { included: false, reason: "curated-exclusion" };
  }
  return { included: true, reason: null };
}

/** Convenience predicate for filter() call sites. */
export function isBoosterBaseline(card: BoosterBaselineCard): boolean {
  return classifyBoosterBaseline(card).included;
}

/** True when this rarity code belongs to the BULK (R/UC/C) slot. */
export function isBulkRarity(rarity: string | null | undefined): boolean {
  return rarity != null && BULK_RARITY_SET.has(rarity);
}
