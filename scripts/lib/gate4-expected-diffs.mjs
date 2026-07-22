function upper(value) {
  return String(value ?? "").toUpperCase();
}

function addChange(changes, field, before, after) {
  if (before !== after) changes[field] = { before, after };
}

export function enumerateGate4ExpectedDiffs({ game, sets, cards, rarities }) {
  const setById = new Map(sets.map((set) => [set.id, set]));
  const trRarities = rarities.filter(
    (rarity) => rarity.game_id === game.id && upper(rarity.code) === "TR"
  );
  if (trRarities.length !== 1) {
    throw new Error(`Expected exactly one One Piece TR taxonomy row, found ${trRarities.length}`);
  }
  const trRarityId = trRarities[0].id;
  const rows = [];

  for (const card of cards.filter((row) => row.game_id === game.id)) {
    const initial = { ...card };
    const working = { ...card };
    const setCode = setById.get(card.set_id)?.code ?? null;
    const selectors = [];

    const correctedCard = working.region === "en" && (
      (working.card_image_id === "OP07-109_p2" && setCode === "OP08") ||
      (working.card_image_id === "ST18-004_p1" && setCode === "OP09")
    );
    if (correctedCard) {
      selectors.push("20260719113000.corrected_cards");
      working.rarity = "TR";
      working.variant_label = "TR";
      if (working.card_image_id === "OP07-109_p2") {
        working.name = String(working.name ?? "").replace(/\(SP\)/i, "(TR)");
      } else if (!/\(TR\)/i.test(String(working.name ?? ""))) {
        working.name = `${working.name ?? ""} (TR)`;
      }
    }

    const variantBackfill = working.region === "en"
      && upper(working.rarity) === "TR"
      && String(working.variant_label ?? "") === "";
    if (variantBackfill) {
      selectors.push("20260719113000.variant_label_backfill");
      working.variant_label = "TR";
    }

    const trReferenceReconcile = working.region === "en" && upper(working.rarity) === "TR";
    if (trReferenceReconcile) {
      selectors.push("20260719114500.tr_reference_reconcile");
      working.rarity = "TR";
      working.rarity_id = trRarityId;
      if (working.card_image_id === "OP07-109_p2") {
        working.name = String(working.name ?? "").replaceAll("(SP)", "(TR)");
      }
    }

    if (selectors.length === 0) continue;
    if (!working.card_image_id) {
      throw new Error(`Gate 4 target card ${working.id} has no card_image_id route identity`);
    }

    const expectedChanges = {};
    addChange(expectedChanges, "name", initial.name, working.name);
    addChange(expectedChanges, "rarity", initial.rarity, working.rarity);
    addChange(expectedChanges, "variant_label", initial.variant_label, working.variant_label);
    addChange(expectedChanges, "rarity_id", initial.rarity_id, working.rarity_id);
    rows.push({
      id: working.id,
      routeId: working.card_image_id,
      setCode,
      selectors,
      expectedChanges,
    });
  }

  return rows.sort((left, right) => left.routeId.localeCompare(right.routeId));
}
