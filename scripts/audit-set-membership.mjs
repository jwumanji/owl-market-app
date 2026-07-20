import { createClient } from "@supabase/supabase-js";

// Node 24 strips erasable TypeScript syntax when importing this pure helper.
import {
  buildDistributionSetCodeIndex,
  distributionSetCode,
} from "../src/lib/set-membership.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAllCards(gameId) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("cards")
      .select("id,set_id,printed_set_code,card_number,card_image_id,name,promo_segment")
      .eq("game_id", gameId)
      .eq("region", "en")
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function main() {
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id")
    .eq("slug", "one_piece")
    .single();

  if (gameError || !game) throw gameError ?? new Error("One Piece game is missing");

  const { data: sets, error: setsError } = await supabase
    .from("sets")
    .select("id,code")
    .eq("game_id", game.id);

  if (setsError) throw setsError;

  const setRows = sets ?? [];
  const codeBySetId = buildDistributionSetCodeIndex(setRows);
  const promoSet = setRows.find((set) => set.code?.trim().toUpperCase() === "P");
  if (!promoSet) throw new Error("One Piece promotion set (code P) is missing");

  const cards = await fetchAllCards(game.id);
  const missingSetId = cards.filter((card) => !card.set_id);
  const unresolvedSetId = cards.filter(
    (card) => card.set_id && !distributionSetCode(card, codeBySetId),
  );
  const promosOutsidePromoSet = cards.filter(
    (card) => card.promo_segment && card.set_id !== promoSet.id,
  );
  const originDistributionDivergences = cards.filter((card) => {
    const distributionCode = distributionSetCode(card, codeBySetId);
    return distributionCode && card.printed_set_code && distributionCode !== card.printed_set_code;
  });

  const eb02Boa = cards.find((card) => card.card_image_id === "OP07-038_sp_eb02");
  const eb02BoaSet = eb02Boa ? distributionSetCode(eb02Boa, codeBySetId) : null;

  const blockers = [
    ...missingSetId.map((card) => ({ id: card.id, issue: "missing_set_id" })),
    ...unresolvedSetId.map((card) => ({ id: card.id, issue: "unresolved_set_id" })),
    ...promosOutsidePromoSet.map((card) => ({
      id: card.id,
      issue: "promo_outside_P",
      currentSet: distributionSetCode(card, codeBySetId),
    })),
  ];

  if (eb02BoaSet !== "EB02") {
    blockers.push({
      id: eb02Boa?.id ?? "OP07-038_sp_eb02",
      issue: "eb02_boa_wrong_distribution",
      currentSet: eb02BoaSet,
    });
  }

  console.log(JSON.stringify({
    cardsAudited: cards.length,
    validDistributionMemberships: cards.length - missingSetId.length - unresolvedSetId.length,
    originDistributionDivergences: originDistributionDivergences.length,
    promosOutsidePromoSet: promosOutsidePromoSet.length,
    eb02BoaDistributionSet: eb02BoaSet,
    blockers: blockers.slice(0, 100),
  }, null, 2));

  if (blockers.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
