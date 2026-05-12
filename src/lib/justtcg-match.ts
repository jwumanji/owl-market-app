/**
 * JustTCG → OWL Market set mapping and card variant detection.
 *
 * TODO: Slug patterns are derived from TCGPlayer naming conventions.
 * Verify against the actual JustTCG API response
 * (GET https://api.justtcg.com/v1/sets?game=one-piece-card-game)
 * and add any missing slugs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// SET_SLUG_MAP — JustTCG set slug → our set code
// ---------------------------------------------------------------------------

export const SET_SLUG_MAP: Record<string, string> = {
  // ── Booster Packs (OP) ──────────────────────────────────────────────────
  "romance-dawn-one-piece-card-game":                    "OP01",
  "paramount-war-one-piece-card-game":                   "OP02",
  "pillars-of-strength-one-piece-card-game":             "OP03",
  "kingdoms-of-intrigue-one-piece-card-game":            "OP04",
  "awakening-of-the-new-era-one-piece-card-game":        "OP05",
  "wings-of-the-captain-one-piece-card-game":            "OP06",
  "500-years-in-the-future-one-piece-card-game":         "OP07",
  "two-legends-one-piece-card-game":                     "OP08",
  "the-four-emperors-one-piece-card-game":               "OP09",
  "emperors-in-the-new-world-one-piece-card-game":       "OP09",
  "royal-blood-one-piece-card-game":                     "OP10",
  "a-fist-of-divine-speed-one-piece-card-game":          "OP11",
  "legacy-of-the-master-one-piece-card-game":            "OP12",
  "carrying-on-his-will-one-piece-card-game":            "OP13",
  "the-azure-sea-s-seven-one-piece-card-game":           "OP14",
  "the-azure-seas-seven-one-piece-card-game":            "OP14",
  "adventure-on-kami-s-island-one-piece-card-game":      "OP15",
  "adventure-on-kamis-island-one-piece-card-game":       "OP15",
  "the-time-of-battle-one-piece-card-game":              "OP16",

  // ── Extra Boosters (EB) ─────────────────────────────────────────────────
  "memorial-collection-one-piece-card-game":             "EB01",
  "extra-booster-memorial-collection-one-piece-card-game": "EB01",
  "extra-booster-memorial-collection-eb-01-one-piece-card-game": "EB01",
  "extra-booster-one-piece-card-game":                   "EB02",
  "eb-02-one-piece-card-game":                           "EB02",
  "anime-25th-collection-one-piece-card-game":           "EB02",
  "extra-booster-anime-25th-collection-one-piece-card-game": "EB02",
  "extra-booster-eb-03-one-piece-card-game":             "EB03",
  "eb-03-one-piece-card-game":                           "EB03",
  "one-piece-heroines-edition-one-piece-card-game":      "EB03",
  "extra-booster-one-piece-heroines-edition-one-piece-card-game": "EB03",
  "eb-04-one-piece-card-game":                           "EB04",

  // ── Premium Boosters (PRB) ──────────────────────────────────────────────
  "one-piece-card-the-best-one-piece-card-game":         "PRB01",
  "prb-01-one-piece-card-game":                          "PRB01",
  "premium-booster--the-best-one-piece-card-game":       "PRB01",
  "premium-booster-the-best-one-piece-card-game":        "PRB01",
  "one-piece-card-the-best-prb-02-one-piece-card-game":  "PRB02",
  "prb-02-one-piece-card-game":                          "PRB02",
  "premium-booster--the-best--vol-2-one-piece-card-game": "PRB02",
  "premium-booster-the-best-vol-2-one-piece-card-game":  "PRB02",

  // ── Starter Decks (ST) ─────────────────────────────────────────────────
  "straw-hat-crew-one-piece-card-game":                  "ST01",
  "starter-deck-1-straw-hat-crew-one-piece-card-game":   "ST01",
  "worst-generation-one-piece-card-game":                "ST02",
  "starter-deck-2-worst-generation-one-piece-card-game": "ST02",
  "the-seven-warlords-of-the-sea-one-piece-card-game":   "ST03",
  "starter-deck-3-the-seven-warlords-of-the-sea-one-piece-card-game": "ST03",
  "animal-kingdom-pirates-one-piece-card-game":          "ST04",
  "starter-deck-4-animal-kingdom-pirates-one-piece-card-game": "ST04",
  "beasts-pirates-one-piece-card-game":                  "ST04",
  "one-piece-film-edition-one-piece-card-game":          "ST05",
  "starter-deck-5-film-edition-one-piece-card-game":     "ST05",
  "absolute-justice-one-piece-card-game":                "ST06",
  "starter-deck-6-absolute-justice-one-piece-card-game": "ST06",
  "navy-one-piece-card-game":                            "ST06",
  "big-mom-pirates-one-piece-card-game":                 "ST07",
  "starter-deck-7-big-mom-pirates-one-piece-card-game":  "ST07",
  "monkey-d-luffy-one-piece-card-game":                  "ST08",
  "starter-deck-8-monkey-d-luffy-one-piece-card-game":   "ST08",
  "yamato-one-piece-card-game":                          "ST09",
  "starter-deck-9-yamato-one-piece-card-game":           "ST09",
  "the-three-captains-one-piece-card-game":              "ST10",
  "ultimate-deck-the-three-captains-one-piece-card-game": "ST10",
  "ultra-deck-the-three-captains-one-piece-card-game":   "ST10",
  "uta-one-piece-card-game":                             "ST11",
  "starter-deck-11-uta-one-piece-card-game":             "ST11",
  "zoro-and-sanji-one-piece-card-game":                  "ST12",
  "starter-deck-12-zoro-and-sanji-one-piece-card-game":  "ST12",
  "the-three-brothers-one-piece-card-game":              "ST13",
  "ultra-deck-the-three-brothers-one-piece-card-game":   "ST13",
  "3d2y-one-piece-card-game":                            "ST14",
  "starter-deck-14-3d2y-one-piece-card-game":            "ST14",
  "red-edward-newgate-one-piece-card-game":              "ST15",
  "starter-deck-15-red-edward-newgate-one-piece-card-game": "ST15",
  "green-uta-one-piece-card-game":                       "ST16",
  "starter-deck-16-green-uta-one-piece-card-game":       "ST16",
  "blue-donquixote-doflamingo-one-piece-card-game":      "ST17",
  "starter-deck-17-blue-donquixote-doflamingo-one-piece-card-game": "ST17",
  "donquixote-doflamingo-one-piece-card-game":           "ST17",
  "purple-monkey-d-luffy-one-piece-card-game":           "ST18",
  "starter-deck-18-purple-monkey-d-luffy-one-piece-card-game": "ST18",
  "black-smoker-one-piece-card-game":                    "ST19",
  "starter-deck-19-black-smoker-one-piece-card-game":    "ST19",
  "smoker-one-piece-card-game":                          "ST19",
  "yellow-charlotte-katakuri-one-piece-card-game":       "ST20",
  "starter-deck-20-yellow-charlotte-katakuri-one-piece-card-game": "ST20",
  "charlotte-katakuri-one-piece-card-game":              "ST20",
  "gear-5-one-piece-card-game":                          "ST21",
  "starter-deck-ex-gear-5-one-piece-card-game":          "ST21",
  "ace-and-newgate-one-piece-card-game":                 "ST22",
  "starter-deck-22-ace-newgate-one-piece-card-game":     "ST22",
  "red-shanks-one-piece-card-game":                      "ST23",
  "starter-deck-23-red-shanks-one-piece-card-game":      "ST23",
  "green-jewelry-bonney-one-piece-card-game":            "ST24",
  "starter-deck-24-green-jewelry-bonney-one-piece-card-game": "ST24",
  "blue-buggy-one-piece-card-game":                      "ST25",
  "starter-deck-25-blue-buggy-one-piece-card-game":      "ST25",
  "purple-black-monkey-d-luffy-one-piece-card-game":     "ST26",
  "starter-deck-26-purple-black-monkey-d-luffy-one-piece-card-game": "ST26",
  "black-marshall-d-teach-one-piece-card-game":          "ST27",
  "starter-deck-27-black-marshall-d-teach-one-piece-card-game": "ST27",
  "green-yellow-yamato-one-piece-card-game":             "ST28",
  "starter-deck-28-green-yellow-yamato-one-piece-card-game": "ST28",
  "egghead-one-piece-card-game":                         "ST29",
  "starter-deck-29-egghead-one-piece-card-game":         "ST29",
  "luffy-and-ace-one-piece-card-game":                   "ST30",
  "starter-deck-ex-luffy-and-ace-one-piece-card-game":   "ST30",

  // ── Promo / Collection sets (all → 'P') ─────────────────────────────────
  "one-piece-promotion-cards-one-piece-card-game":                        "P",
  "one-piece-collection-sets-one-piece-card-game":                        "P",

  // Premium Card Collection — Best Selection Vol.1–5
  "premium-card-collection-best-selection-vol-1-one-piece-card-game":     "P",
  "premium-card-collection-best-selection-vol-2-one-piece-card-game":     "P",
  "premium-card-collection-best-selection-vol-3-one-piece-card-game":     "P",
  "premium-card-collection-best-selection-vol-4-one-piece-card-game":     "P",
  "premium-card-collection-best-selection-vol-5-one-piece-card-game":     "P",

  // Premium Card Collection — Themed editions
  "premium-card-collection-25th-edition-one-piece-card-game":             "P",
  "premium-card-collection-live-action-edition-one-piece-card-game":      "P",
  "premium-card-collection-film-red-edition-one-piece-card-game":         "P",
  "premium-card-collection-uta-one-piece-card-game":                      "P",
  "premium-card-collection-yamato-one-piece-card-game":                   "P",

  // Anniversary sets
  "english-version-1st-anniversary-set-one-piece-card-game":              "P",
  "english-version-2nd-anniversary-set-one-piece-card-game":              "P",
  "english-version-3rd-anniversary-set-one-piece-card-game":              "P",
  "japanese-1st-anniversary-set-one-piece-card-game":                     "P",

  // Pre-release / event promos
  "pre-release-cards-one-piece-card-game":                                "P",
  "one-piece-day-one-piece-card-game":                                    "P",
  "one-piece-day-2024-one-piece-card-game":                               "P",
  "one-piece-day-2025-one-piece-card-game":                               "P",
  "film-red-one-piece-card-game":                                         "P",

  // Tournament / event packs
  "tournament-pack-vol-1-one-piece-card-game":                            "P",
  "tournament-pack-vol-2-one-piece-card-game":                            "P",
  "tournament-pack-vol-3-one-piece-card-game":                            "P",
  "tournament-pack-vol-4-one-piece-card-game":                            "P",
  "tournament-pack-vol-5-one-piece-card-game":                            "P",
  "tournament-pack-vol-6-one-piece-card-game":                            "P",
  "tournament-pack-vol-7-one-piece-card-game":                            "P",
  "tournament-pack-vol-8-one-piece-card-game":                            "P",

  // Sealed / bundle promos
  "double-pack-set-one-piece-card-game":                                  "P",
  "double-pack-set-vol-1-one-piece-card-game":                            "P",
  "double-pack-set-vol-2-one-piece-card-game":                            "P",
  "double-pack-set-vol-3-one-piece-card-game":                            "P",
  "double-pack-set-vol-4-one-piece-card-game":                            "P",
  "super-pre-release-starter-deck-one-piece-card-game":                   "P",
  "demo-deck-one-piece-card-game":                                        "P",
  "gift-collection-one-piece-card-game":                                  "P",
  "gift-collection-2023-one-piece-card-game":                             "P",
  "gift-collection-2024-one-piece-card-game":                             "P",
  "treasure-pack-one-piece-card-game":                                    "P",
  "treasure-cruise-one-piece-card-game":                                  "P",
  "official-tournament-store-one-piece-card-game":                        "P",
  "event-cards-one-piece-card-game":                                      "P",
  "winner-cards-one-piece-card-game":                                     "P",
  "participation-cards-one-piece-card-game":                               "P",
};

// ---------------------------------------------------------------------------
// classifyRarity — derive true rarity from card name + variant_label + base rarity
// ---------------------------------------------------------------------------

/**
 * Classify a card's true rarity based on its name and variant_label.
 * Cards in the DB may all be stored as "SEC" but actually be Manga Rares,
 * Alt Arts, Special Rares, etc. This function inspects the name for
 * keywords like (Manga), (Alternate Art), (SP), (Super Alternate Art).
 *
 * Returns the corrected rarity code: "MR", "SP", "AA", "SAR", or the
 * original baseRarity if no variant keyword is found.
 */
export function classifyRarity(
  name: string,
  variantLabel: string | null,
  baseRarity: string
): string {
  // Build a combined haystack so matches work whether the hint lives in the
  // full name (as JustTCG delivers it) or has been moved into variant_label
  // (as the DB stores it after extractVariantLabel).
  const hay = `${name ?? ""} ${variantLabel ?? ""}`;

  // Order matters: check more specific patterns first.
  // 1. Manga Rare — highest priority chase cards
  if (/\bmanga\b/i.test(hay))
    return "MR";
  // 2. Treasure Rare — (TR) tag
  if (/\(TR\)/i.test(hay))
    return "TR";
  // 3. Super Alternate Art — (Super Alternate Art) / (Red Super Alternate Art)
  if (/\(red super alternate art\)/i.test(hay) || /\(super alternate art\)/i.test(hay))
    return "SAR";
  // 4. SP — (SP), (SPR), (SP) (Gold), (Wanted Poster)
  if (/\(sp\)/i.test(hay) || /\(spr\)/i.test(hay))
    return "SP";
  if (/\(wanted poster\)/i.test(hay))
    return "SP";
  // 5. Alternate Art
  if (/\(alternate art\)/i.test(hay))
    return "AA";
  // Parallel-only variants and Box Toppers stay as base rarity
  return baseRarity;
}

// ---------------------------------------------------------------------------
// extractVariantLabel — detect promo variant from card name suffix
// ---------------------------------------------------------------------------

// Order matters: most specific first. "Super Alternate Art" must come before
// "Alternate Art" so the broader pattern doesn't swallow the specific one.
const VARIANT_PATTERNS: [RegExp, string][] = [
  [/\(Manga\)/i,                   "Manga"],
  [/\(Red Super Alternate Art\)/i, "Red Super Alternate Art"],
  [/\(Super Alternate Art\)/i,     "Super Alternate Art"],
  [/\(SP\)[^)]*\(Gold\)/i,         "SP Gold"],
  [/\(SP\)[^)]*\(Silver\)/i,       "SP Silver"],
  [/\(SP\)/i,                      "SP"],
  [/\(SPR\)/i,                     "SP"],
  [/\(TR\)/i,                      "TR"],
  [/\(Wanted Poster\)/i,           "Wanted Poster"],
  [/\(Gold-Stamped Signature\)/i,  "Gold-Stamped Signature"],
  [/\(Alternate Art\)/i,           "Alternate Art"],
  [/\(Parallel\)/i,                "Parallel"],
  [/\(Best Selection\)/i,          "Alt Art"],
  [/\(Anniversary\)/i,             "Anniversary"],
  [/\(Pre-Release\)/i,             "Pre-Release"],
  [/\(Film Red\)/i,                "Alt Art"],
  [/\(ONE PIECE DAY\)/i,           "Alt Art"],
  [/\(Jolly Roger Foil\)/i,        "Jolly Roger Foil"],
  [/\(Reprint\)/i,                 "Reprint"],
];

/**
 * Extract the variant label from a card name.
 * Returns the variant string or null if no variant suffix is found.
 *
 * Examples:
 *   "Monkey D. Luffy (Parallel)"       → "Parallel"
 *   "Nami (Best Selection)"            → "Alt Art"
 *   "Roronoa Zoro (Pre-Release)"       → "Pre-Release"
 *   "Shanks"                           → null
 */
export function extractVariantLabel(name: string): string | null {
  for (const [pattern, label] of VARIANT_PATTERNS) {
    if (pattern.test(name)) return label;
  }
  return null;
}

// ---------------------------------------------------------------------------
// resolveSetCode — look up a JustTCG slug in the map
// ---------------------------------------------------------------------------

/**
 * Resolve a JustTCG set slug to our internal set code.
 * Returns the code (e.g. "OP01", "P", "ST13") or null if unknown.
 */
export function resolveSetCode(justTcgSlug: string): string | null {
  return SET_SLUG_MAP[justTcgSlug] ?? null;
}

// ---------------------------------------------------------------------------
// Auto-create helpers
// ---------------------------------------------------------------------------

function classifySeries(code: string): string {
  if (code.startsWith("OP")) return "BOOSTER";
  if (code.startsWith("EB")) return "EXTRA_BOOSTER";
  if (code.startsWith("PRB")) return "PREMIUM_BOOSTER";
  if (code.startsWith("ST")) return "STARTER";
  return "PROMO";
}

function humanNameFromSlug(slug: string): string {
  return slug
    .replace(/-one-piece-card-game$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// ensureSetExists — auto-create a set row if it doesn't exist yet
// ---------------------------------------------------------------------------

/**
 * Ensure a set row exists in the database for the given code.
 * If it doesn't exist, inserts a new row with metadata derived from the slug.
 * Returns the set UUID.
 */
export async function ensureSetExists(
  supabase: SupabaseClient,
  justTcgSlug: string,
  setCode: string
): Promise<string | null> {
  const slug = setCode.toLowerCase();

  // Check if set already exists
  const { data: existing } = await supabase
    .from("sets")
    .select("id")
    .eq("slug", slug)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Insert new set
  const { data: inserted, error } = await supabase
    .from("sets")
    .insert({
      slug,
      code: setCode,
      name: humanNameFromSlug(justTcgSlug),
      series: classifySeries(setCode),
    })
    .select("id")
    .single();

  if (inserted) return inserted.id;

  // Conflict (race condition) — re-query
  if (error?.code === "23505") {
    const { data: raced } = await supabase
      .from("sets")
      .select("id")
      .eq("slug", slug)
      .limit(1)
      .single();
    return raced?.id ?? null;
  }

  return null;
}
