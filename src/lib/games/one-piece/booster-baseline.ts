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
//   2. the id carries a PRODUCT-ORIGIN HYPHEN SUFFIX       (structural rule —
//      see THE ID GRAMMAR below; replaces the enumerated EVENT_ID_MARKERS
//      list, which only ever caught what someone had already noticed)
//   3. rarity is "PR"                                      (promos by class —
//      pull-rates-research.md §5: "not pulled from boosters")
//   4. rarity is R/UC/C AND the card is not vanilla bulk:
//      the id carries a "_p" parallel suffix, or the name carries a
//      variant/venue name marker (BULK_NAME_MARKERS — catches plain-id leaks
//      like OP06-047 "Charlotte Pudding (SP)" classed R, OP13-084 "(Parallel)",
//      and the OP03/OP14 "(Dash Pack)" event cards; sensitivity appendix §S.2–S.4)
//   5. card_image_id is on the curated exclusion list      (known plain-id
//      polluted rows string rules cannot reach — e.g. OP04-015 at $201 where
//      the honest OP04 bulk average is ~$0.13; appendix §S.3)
//
// THE ID GRAMMAR (evidenced by a full-catalog sweep, 2026-07-27, 5,053 ids):
//
//   booster id        := <PRINTEDCODE> "-" <digits> [ "_" <variant> ]
//   product-origin id := <PRINTEDCODE> "-" <digits> "-" <origin-tokens...>
//
// Booster paper never carries hyphen segments after the card number — variant
// axes (parallel _p1, reprint _r1, jp _jp_NNNNN, special _sp_*, treasure
// _tr_*) are ALWAYS spelled with underscores. Extra hyphen segments after the
// number are how the catalog spells "came from a product/venue, not a pack":
// 33 distinct suffix tokens exist (-winner-pack, -regional-prize, -cs-pack,
// -judge-pack, -anniversary-set, -gift-collection, -sound-loader, …), 327 ids,
// and EVERY one is a product/event/venue distribution. Zero booster-obtainable
// cards carry a hyphen suffix. Two grammar guards, both evidenced:
//   · the number segment must be all digits — protects the two malformed
//     doubled-code ids OP07-OP07-037 ("More Pizza!!" UC) and OP16-OP16-011-TR
//     ("Vista (TR)"), which are real booster cards the grammar cannot parse;
//   · a lone trailing "r<digits>" segment is a hyphen-spelled reprint variant,
//     not a product origin — OP09-078-r1 "Gum-Gum Giant (Reprint)" is the
//     twin of the "_r1" ids, and reprints stay included by design (§ below).
// Sweep verification (scripts/audit-booster-baseline.mjs re-runs it): against
// the enumerated-marker classifier this rule newly excludes 17 product-origin
// ids the list had missed (gift-collection, sound-loader, crossover-promo,
// tournament-prize, sealed-battle-kit, special-event, treasure-booster — none
// in a seeded slot with a price, so all 13 Box EVs are unchanged) and loses
// ZERO exclusions. This is grounded structure, not a catch-all: the parse is
// explicit split/charCode checks against a grammar the whole catalog was
// measured to obey, with the two exceptions named above guarded explicitly.
//
// Everything else is INCLUDED. Deliberately NOT excluded:
//   · "_r*" reprint ids (and OP09-078-r1) — reprint variants of booster cards;
//     the draft's §8.2 accepts them as a conservative approximation (they
//     trade in pennies for bulk and BELOW originals for MR classes).
//   · "_p*" / "_sp_*" ids in HIT classes (L, SR, AA, MR, SP, …) — parallels
//     with hit rarities are chase pulls; only base-rarity (R/UC/C) parallels
//     are excluded, because they are chase/topper paper that the ~271-card
//     BULK multiplier would otherwise amplify (§S.2).
//
// Matching is explicit startsWith/includes/split ONLY — never regex catch-alls
// (CLAUDE.md §8). The string approach is known to age worse than a flag column
// (audit §7); when a curated flag lands, this module is the one place to swap
// it in. `npm run audit:booster-baseline` is the tripwire: it re-checks the
// grammar over the live catalog and price-flags any included card sitting far
// outside its (set, rarity, variant-bucket) peers, so the next plain-id leak
// surfaces on its own instead of waiting to be noticed.
// ---------------------------------------------------------------------------

/** Rarity codes the BULK slot aggregates (spec §3.5). */
export const BULK_RARITY_CODES = ["R", "UC", "C"] as const;

const BULK_RARITY_SET: ReadonlySet<string> = new Set(BULK_RARITY_CODES);

function isAsciiDigits(value: string): boolean {
  if (value.length === 0) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

/**
 * Structural rule 2 — does this id carry a product-origin hyphen suffix?
 *
 * Parses THE ID GRAMMAR (header): the stem before the first "_" must be
 * exactly <PRINTEDCODE>-<digits>; any further hyphen segments mean the card
 * came from a product/venue distribution, not a booster pack. The two guards
 * (digits check, trailing r<digits> reprint segment) are documented with
 * their evidence in the header. Exported for the audit script, which uses it
 * as the classifier-regression invariant.
 */
export function hasProductOriginIdSuffix(cardImageId: string): boolean {
  const underscoreAt = cardImageId.indexOf("_");
  const stem = underscoreAt >= 0 ? cardImageId.slice(0, underscoreAt) : cardImageId;
  const segments = stem.split("-");
  // <PRINTEDCODE>-<digits> or shorter — no hyphen suffix to judge.
  if (segments.length < 3) return false;
  // Malformed doubled-code ids (OP07-OP07-037, OP16-OP16-011-TR): the grammar
  // does not apply, and both are real booster cards — never exclude on shape.
  if (!isAsciiDigits(segments[1])) return false;
  // Lone trailing "r<digits>" segment = hyphen-spelled reprint variant
  // (OP09-078-r1), the twin of "_r1" — reprints stay included by design.
  if (segments.length === 3) {
    const tail = segments[2];
    if (tail.length >= 2 && tail.charCodeAt(0) === 114 /* "r" */ && isAsciiDigits(tail.slice(1))) {
      return false;
    }
  }
  return true;
}

/**
 * Name markers that disqualify a base-rarity (R/UC/C) card from vanilla bulk.
 * These catch plain-id leaks the id grammar cannot see. Evidenced live:
 * "(SP)" → OP06-047 $84 classed R; "(Parallel)" → OP13-084 $18.12, the one
 * plain-id row in the catalog named "(Parallel)" (its siblings OP13-080_p2 …
 * OP13-091_p2 are R parallels at $399–494 — the row is parallel data landed
 * on the base id); "(Dash Pack)" → OP03-070/-081/-050/-032, OP14-087;
 * "(Pirate Foil)" → OP10-018; "Box Topper" from the original audit rule. The
 * venue families are defensive twins of the id-grammar rule for the day one
 * ships with a plain id, as EB01-003's regional-prize card once did.
 */
export const BULK_NAME_MARKERS = [
  "Box Topper",
  "(SP)",
  "(Parallel)",
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
  // "event-id" is kept as the reason literal for product-origin ids so the
  // promo-callout consumer contract is unchanged.
  if (hasProductOriginIdSuffix(id)) {
    return { included: false, reason: "event-id" };
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
