// Audit price sync gaps: per-rarity unpriced + suspiciously-low samples.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kiquytaevufssveqmqix.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in env before running.");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function fetchAll(path) {
  const out = []; const pageSize = 1000; let offset = 0;
  while (true) {
    const r = await fetch(`${URL}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: H });
    if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
    const b = await r.json();
    if (!b.length) break;
    out.push(...b);
    if (b.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

const sets = await fetchAll("sets?select=id,code,slug");
const setIdToCode = new Map(sets.map(s => [s.id, (s.code ?? "").toUpperCase()]));
const promoSetId = sets.find(s => s.slug === "promo")?.id ?? null;

const cards = await fetchAll("cards?select=id,set_id,name,card_number,variant_label,rarity,price_stats(tcg_market,market_avg,tcg_low,updated_at)");
console.log(`cards=${cards.length}`);

const FOCUS = ["SR","L","R","SEC","TR","UC","C"];
const buckets = {};
for (const code of FOCUS) buckets[code] = { total:0, unpriced:0, zero:0, lt1:0, lt5:0, noJusttcg:0, samples:[] };

for (const c of cards) {
  const code = (c.rarity ?? "").toUpperCase();
  if (!FOCUS.includes(code)) continue;
  if (c.set_id === promoSetId) continue;
  const ps = Array.isArray(c.price_stats) ? c.price_stats[0] : c.price_stats;
  const tcg = ps?.tcg_market;
  const b = buckets[code];
  b.total++;
  if (ps == null) { b.unpriced++; if (b.samples.length < 5) b.samples.push({ why:"no price_stats row", set:setIdToCode.get(c.set_id), num:c.card_number, name:c.name, vl:c.variant_label, jid:c.justtcg_id }); continue; }
  if (tcg == null) { b.unpriced++; if (b.samples.length < 5) b.samples.push({ why:"tcg_market null", set:setIdToCode.get(c.set_id), num:c.card_number, name:c.name, vl:c.variant_label, jid:c.justtcg_id }); continue; }
  if (tcg === 0) { b.zero++; if (b.samples.length < 5) b.samples.push({ why:"tcg=0", set:setIdToCode.get(c.set_id), num:c.card_number, name:c.name, vl:c.variant_label, jid:c.justtcg_id }); continue; }
  if (tcg < 1) b.lt1++;
  else if (tcg < 5) b.lt5++;
}

console.log();
console.log("code  total unpriced  zero  <$1  <$5  noJustTCG");
for (const code of FOCUS) {
  const b = buckets[code];
  console.log(code.padEnd(5), String(b.total).padEnd(6), String(b.unpriced).padEnd(9), String(b.zero).padEnd(6), String(b.lt1).padEnd(5), String(b.lt5).padEnd(5), b.noJusttcg);
}

// Find SR cards specifically that might be underpriced
const srCards = cards.filter(c => (c.rarity ?? "").toUpperCase() === "SR" && c.set_id !== promoSetId);
const srWithPrice = srCards.map(c => {
  const ps = Array.isArray(c.price_stats) ? c.price_stats[0] : c.price_stats;
  return { name: c.name, set: setIdToCode.get(c.set_id), num: c.card_number, vl: c.variant_label, tcg: ps?.tcg_market ?? null, low: ps?.tcg_low ?? null, jid: null };
});
const srPriced = srWithPrice.filter(x => x.tcg != null && x.tcg > 0);
const srMax = srPriced.sort((a,b) => (b.tcg) - (a.tcg)).slice(0, 10);
console.log("\nTop 10 most expensive SR cards (sanity check):");
for (const s of srMax) console.log(`  ${s.set} ${s.num ?? ""} ${(s.name ?? "").padEnd(40)} tcg=$${s.tcg}  vl=${s.vl ?? ""}  jid=${s.jid ? "Y" : "N"}`);

// Top SR by tcg, split into base (no variant_label) vs variants
const srBase = srPriced.filter(x => !x.vl).sort((a,b)=>b.tcg-a.tcg).slice(0,15);
const srVariants = srPriced.filter(x => x.vl).sort((a,b)=>b.tcg-a.tcg).slice(0,10);
console.log("\nTop 15 SR (BASE — no variant_label):");
for (const s of srBase) console.log(`  ${s.set} ${(s.num??"").padEnd(10)} ${(s.name??"").slice(0,42).padEnd(42)} tcg=$${s.tcg}`);
console.log("\nBase SR count:", srPriced.filter(x=>!x.vl).length, "  Variant SR count:", srPriced.filter(x=>x.vl).length);

// Top L cards
const lCards = cards.filter(c => (c.rarity ?? "").toUpperCase() === "L" && c.set_id !== promoSetId).map(c => {
  const ps = Array.isArray(c.price_stats) ? c.price_stats[0] : c.price_stats;
  return { name: c.name, set: setIdToCode.get(c.set_id), num: c.card_number, vl: c.variant_label, tcg: ps?.tcg_market ?? 0 };
}).sort((a,b)=>b.tcg-a.tcg).slice(0,15);
console.log("\nTop 15 Leader cards:");
for (const s of lCards) console.log(`  ${s.set} ${(s.num??"").padEnd(10)} ${(s.name??"").slice(0,42).padEnd(42)} tcg=$${s.tcg}  vl=${s.vl??""}`);

// Check tcg_market vs market_avg discrepancies (>3x)
console.log("\nCards where market_avg is >3x tcg_market (potentially stale tcg_market):");
let mismatches = 0;
for (const c of cards) {
  if (c.set_id === promoSetId) continue;
  const ps = Array.isArray(c.price_stats) ? c.price_stats[0] : c.price_stats;
  if (!ps?.tcg_market || !ps?.market_avg) continue;
  if (ps.market_avg > ps.tcg_market * 3 && ps.market_avg > 10) {
    mismatches++;
    if (mismatches <= 15) console.log(`  ${(c.rarity??"").padEnd(4)} ${setIdToCode.get(c.set_id)} ${(c.card_number??"").padEnd(10)} ${(c.name??"").slice(0,38).padEnd(38)} tcg=$${ps.tcg_market}  avg=$${ps.market_avg}`);
  }
}
console.log(`  total such mismatches: ${mismatches}`);

// Stale price_stats
console.log("\nOldest price_stats updated_at samples:");
const withTs = cards.filter(c => c.set_id !== promoSetId).map(c => {
  const ps = Array.isArray(c.price_stats) ? c.price_stats[0] : c.price_stats;
  return { c, ts: ps?.updated_at };
}).filter(x => x.ts).sort((a,b) => new Date(a.ts) - new Date(b.ts)).slice(0,5);
for (const x of withTs) console.log(`  ${x.ts}  ${x.c.rarity}  ${setIdToCode.get(x.c.set_id)}  ${x.c.name}`);
