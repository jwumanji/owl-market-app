import type { GameScope } from "@/lib/game-scope";

function statusValue(game: GameScope, key: string) {
  const value = game.metadata[key];
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function pricingIsDeferred(game: GameScope) {
  const status = statusValue(game, "pricing_status");
  return ["deferred", "disabled", "not_enabled", "pending"].includes(status);
}

function assetsNeedReview(game: GameScope) {
  const status = statusValue(game, "asset_status");
  return status.includes("review") || ["deferred", "pending"].includes(status);
}

export function catalogPageDescription(game: GameScope) {
  const deferredPricing = pricingIsDeferred(game);
  const reviewAssets = assetsNeedReview(game);

  if (deferredPricing && reviewAssets) {
    return "Imported card rows from the game-scoped catalog schema. This view stays catalog-only until pricing and image asset review are enabled for this game.";
  }

  if (deferredPricing) {
    return "Imported card rows from the game-scoped catalog schema. Pricing is not enabled for this game yet, so this view focuses on source catalog metadata.";
  }

  if (reviewAssets) {
    return "Imported card rows from the game-scoped catalog schema. Image assets are still under review for this game, while catalog metadata is available now.";
  }

  return "Imported card rows from the game-scoped catalog schema. Use this view to inspect canonical catalog metadata before opening market or set-specific pages.";
}

export function catalogCardDescription(game: GameScope) {
  if (pricingIsDeferred(game)) {
    return `Catalog metadata imported for ${game.name}. Pricing is not enabled for this game yet.`;
  }

  return `Catalog metadata imported for ${game.name}. Market pricing remains available through the game-specific market routes when provider data exists.`;
}
