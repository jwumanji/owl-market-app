import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import { buildDistributionSetCodeIndex, distributionSetCode } from "../src/lib/set-membership.ts";

const codeBySetId = buildDistributionSetCodeIndex([
  { id: "set-op07", code: "OP07" },
  { id: "set-op09", code: "OP09" },
  { id: "set-eb02", code: "EB02" },
  { id: "set-promo", code: "P" },
]);

test("EB02 Boa Hancock stays in EB02 despite its OP07 printed number", () => {
  const boa = {
    set_id: "set-eb02",
    printed_set_code: "OP07",
    card_number: "OP07-038",
    card_image_id: "OP07-038_sp_eb02",
  };

  assert.equal(distributionSetCode(boa, codeBySetId), "EB02");
});

test("OP09-distributed Boa Hancock stays in OP09 despite its OP07 printed number", () => {
  const boa = {
    set_id: "set-op09",
    printed_set_code: "OP07",
    card_number: "OP07-051",
    card_image_id: "OP07-051_p3",
  };

  assert.equal(distributionSetCode(boa, codeBySetId), "OP09");
});

test("promotional printings stay in the promo distribution set", () => {
  assert.equal(
    distributionSetCode({ set_id: "set-promo" }, codeBySetId),
    "P",
  );
});

test("cards with missing or unresolved set relationships are not guessed from card numbers", () => {
  assert.equal(distributionSetCode({ set_id: null }, codeBySetId), null);
  assert.equal(distributionSetCode({ set_id: "missing-set" }, codeBySetId), null);
});
