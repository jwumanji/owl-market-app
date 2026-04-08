// Audit rarity totals: counts + sum(tcg_market) + sum(market_avg)
// per rarity, both globally (excluding promo set) and restricted to the
// sets-index ALLOWED_CODES whitelist.

const URL = "https://kiquytaevufssveqmqix.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcXV5dGFldnVmc3N2ZXFtcWl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMzNjAyNywiZXhwIjoyMDg5OTEyMDI3fQ._15oM28RbPSEU8Yj4XjTDN2fDTMGDL66Pf7iuGVmwiI";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const ALLOWED_CODES = new Set([
  "OP01","OP02","OP03","OP04","OP05","OP06","OP07","OP08","OP09","OP10",
  "OP11","OP12","OP13","OP14","PRB01","PRB02","EB01","EB02","EB03",
]);

const RARITY_CODES = ["MR","GMR","SP","SEC","TR","AA","SR","L","R","UC","C","SAR","PROMO"];

async function fetchAll(path) {
  const out = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const r = await fetch(`${URL}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: H });
    if (!r.ok) {
      console.error("HTTP", r.status, await r.text());
      process.exit(1);
    }
    const b = await r.json();
    if (!b.length) break;
    out.push(...b);
    if (b.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

// 1. Resolve sets → set_id, code, slug
const sets = await fetchAll("sets?select=id,code,slug");
const setIdToCode = new Map(sets.map((s) => [s.id, (s.code ?? "").toUpperCase()]));
const promoSet = sets.find((s) => s.slug === "promo");
const promoSetId = promoSet?.id ?? null;
const allowedSetIds = new Set(sets.filter((s) => ALLOWED_CODES.has((s.code ?? "").toUpperCase())).map((s) => s.id));

console.log(`sets total=${sets.length}  promoSetId=${promoSetId}  allowedSets=${allowedSetIds.size}`);

// 2. Pull every card with its (optional) price_stats join
const cards = await fetchAll("cards?select=id,set_id,rarity,price_stats(tcg_market,market_avg)");
console.log(`cards total=${cards.length}`);

// 3. Aggregate
const agg = {};
for (const code of RARITY_CODES) {
  agg[code] = {
    total: 0, priced: 0,
    sumTcgAll: 0, sumAvgAll: 0,
    totalAllowed: 0, pricedAllowed: 0,
    sumTcgAllowed: 0, sumAvgAllowed: 0,
  };
}

for (const c of cards) {
  const code = (c.rarity ?? "").toUpperCase();
  if (!agg[code]) continue;
  if (c.set_id === promoSetId && code !== "PROMO") continue;

  const inAllowed = allowedSetIds.has(c.set_id);
  const ps = c.price_stats; // can be null, object, or array depending on cardinality
  const psObj = Array.isArray(ps) ? ps[0] : ps;
  const tcg = psObj?.tcg_market;
  const avg = psObj?.market_avg;

  agg[code].total++;
  if (inAllowed) agg[code].totalAllowed++;

  if (tcg != null) {
    agg[code].priced++;
    agg[code].sumTcgAll += Number(tcg) || 0;
    agg[code].sumAvgAll += Number(avg) || 0;
    if (inAllowed) {
      agg[code].pricedAllowed++;
      agg[code].sumTcgAllowed += Number(tcg) || 0;
      agg[code].sumAvgAllowed += Number(avg) || 0;
    }
  }
}

// 4. Print
const fmt = (n) => `$${Math.round(n).toLocaleString()}`;
const pad = (s, n) => String(s).padEnd(n);
console.log();
console.log(pad("code", 6), pad("cards", 7), pad("priced", 7), pad("sum_tcg_all", 14), pad("sum_avg_all", 14), pad("cards_w", 8), pad("priced_w", 9), pad("sum_tcg_w", 14), pad("sum_avg_w", 14));
for (const code of RARITY_CODES) {
  const a = agg[code];
  console.log(
    pad(code, 6),
    pad(a.total, 7),
    pad(a.priced, 7),
    pad(fmt(a.sumTcgAll), 14),
    pad(fmt(a.sumAvgAll), 14),
    pad(a.totalAllowed, 8),
    pad(a.pricedAllowed, 9),
    pad(fmt(a.sumTcgAllowed), 14),
    pad(fmt(a.sumAvgAllowed), 14),
  );
}
console.log();
console.log("legend: _all = excludes promo set only.  _w = restricted to sets-index ALLOWED_CODES whitelist.");
