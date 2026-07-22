import assert from "node:assert/strict";
import test from "node:test";

import {
  riftboundChampionSpotlights,
} from "../src/lib/market-riftbound-dashboard.ts";
import type { DashboardCard } from "../src/lib/types.ts";

function card(overrides: Partial<DashboardCard>): DashboardCard {
  return {
    id: "card-1",
    card_image_id: "riftbound:card-1",
    card_number: "OGN-001",
    name: "Ahri - Nine-Tailed Fox",
    rarity: "Signature",
    image_url: null,
    image_url_small: null,
    image_url_preview: null,
    set_code: "OGN",
    market_avg: 100,
    changes: { "7D": 4.5 },
    ...overrides,
  };
}

test("builds champion spotlights from the highest-value Riftbound cards", () => {
  const spotlights = riftboundChampionSpotlights([
    card({ id: "ahri-1", market_avg: 500, image_url: "https://cdn.example/ahri.jpg" }),
    card({ id: "ahri-2", name: "Ahri - Inquisitive", market_avg: 250 }),
    card({ id: "jinx-1", name: "Jinx - Loose Cannon", market_avg: 400, changes: { "7D": -2 } }),
  ]);

  assert.deepEqual(spotlights.map((item) => [item.name, item.index_value]), [
    ["Ahri", 750],
    ["Jinx", 400],
  ]);
  assert.equal(spotlights[0]?.image_url, "https://cdn.example/ahri.jpg");
  assert.equal(spotlights[1]?.changes["7D"], -2);
});
