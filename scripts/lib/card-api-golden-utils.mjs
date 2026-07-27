export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

const PRICE_BEARING_FIELDS = new Set([
  "amount",
  "avg",
  "count",
  "market_avg",
  "price_jpy",
  "rawAvg",
  "rawCount",
  "sale_price",
  "tcg_market",
]);

function structureValue(value) {
  if (Array.isArray(value)) {
    const elementShapes = Array.from(
      new Set(value.map((item) => stableJson(structureValue(item))))
    ).sort();
    return { type: "array", elementShapes };
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, structureValue(value[key])])
    );
  }
  return "<scalar>";
}

function shapeIdentityValue(value, path = []) {
  const pathKey = path.join(".");
  if (pathKey === "history.priceHistory" || pathKey === "extras.ebayStats") {
    return structureValue(value);
  }
  if (PRICE_BEARING_FIELDS.has(path.at(-1))) return "<price-bearing>";
  if (Array.isArray(value)) {
    return value.map((item, index) => shapeIdentityValue(item, [...path, String(index)]));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shapeIdentityValue(value[key], [...path, key])])
    );
  }
  return value;
}

function comparisonValue(value, profile, root) {
  if (profile === "shape_identity") return shapeIdentityValue(value, [root]);
  return stableValue(value);
}

export function summarizeCardDifference(expected, actual, profile = "exact") {
  const sections = [];
  if (
    stableJson(comparisonValue(expected.extras, profile, "extras")) !==
    stableJson(comparisonValue(actual.extras, profile, "extras"))
  ) sections.push("extras");
  if (
    stableJson(comparisonValue(expected.history, profile, "history")) !==
    stableJson(comparisonValue(actual.history, profile, "history"))
  ) sections.push("history");
  return sections;
}

export function classifyExpectedDifferences(differences, expectedIds = new Set()) {
  return differences.map((difference) => ({
    ...difference,
    status: expectedIds.has(difference.id) ? "EXPECTED" : "UNEXPECTED",
  }));
}
