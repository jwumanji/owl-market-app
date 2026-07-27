import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import FastCardImage from "@/components/ui/FastCardImage";
import RarityBadge from "@/components/ui/RarityBadge";
import { loadSealedDetail, type SealedDetailData } from "./load-sealed-detail";
import SealedDetailClient from "./SealedDetailClient";
import "../terminal.css";
import "./sealed-detail.css";

// Server component: calls the loader (service-role — market_index_snapshots is
// anon-revoked, so set value / Value Ratio resolve HERE and travel down as
// props, spec §6), then hands everything to the client for interactivity.
//
// Section seams: this component renders the breadcrumb shell, mounts the
// Phase E client (§3.1 hero + §3.2 price history), then renders the Phase F
// sections (§3.3 market stats, §3.4 top 10) as static server JSX — they have
// no interactivity (hover is CSS), so they stay out of the client bundle.
// Phase G (§3.5 Box EV) mounts at the seam comment below.

// -- formatting (server-side twins of the client helpers — runtime values
//    cannot cross the "use client" boundary in either direction without
//    dragging the wrong module graph along, so the few we need live here) ----

const EM = "—"; // em-dash — the only rendering for missing values, never 0

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return EM;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

/** Card-level prices keep the cents, matching /sets and /card/[id]. */
function fmtMoney2(v: number | null | undefined): string {
  if (v == null) return EM;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return EM;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/** Exactly-zero deltas are --ink-3 (t-flat), never green — spec §8. */
function deltaCls(v: number | null | undefined): string {
  if (v == null || v === 0) return "t-flat";
  return v > 0 ? "t-up" : "t-down";
}

/** "JUL 05 2026" */
function fmtDateFull(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`))
    .toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit", year: "numeric" })
    .toUpperCase()
    .replace(",", "");
}

function productTypeLabel(type: string): string {
  return type.replace(/_/g, " ").toUpperCase();
}

/** PRICE ACTIVITY sub-label — the age of the last move in OUR rows. */
function lastMoveSub(lastMoveDays: number | null): string {
  if (lastMoveDays == null) return "NEVER MOVED";
  if (lastMoveDays === 0) return "MOVED TODAY";
  if (lastMoveDays <= 7) return `MOVED ${lastMoveDays}D AGO`;
  return `FLAT ${lastMoveDays}D`;
}

export async function SealedDetailContent({
  slug,
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  slug: string;
  gameRouteSlug?: string | null;
}) {
  const isDefaultGame = !gameRouteSlug || gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const homeHref = isDefaultGame ? "/" : gamePath(gameRouteSlug);
  const sealedHref = isDefaultGame ? "/terminal/sealed" : gamePath(gameRouteSlug, "/terminal/sealed");

  let data: SealedDetailData | null = null;
  let loadError = false;
  try {
    data = await loadSealedDetail({ slug, game: gameRouteSlug });
  } catch {
    loadError = true;
  }

  if (loadError) {
    // Error fallback consistent with Phase D's dashboard placeholder.
    return (
      <section className="terminal-page sealed-detail-page">
        <div className="terminal-breadcrumb">
          <Link href={homeHref} prefetch={false}>OWL Market</Link>
          <span aria-hidden="true">›</span>
          <span>Terminal</span>
          <span aria-hidden="true">›</span>
          <Link href={sealedHref} prefetch={false}>Sealed</Link>
        </div>
        <div className="terminal-placeholder">
          <div className="terminal-placeholder-label">Data unavailable</div>
          <p className="terminal-placeholder-body">
            Failed to load sealed product data. Try again shortly.
          </p>
        </div>
      </section>
    );
  }

  // Unknown slug → 404. Outside the try/catch so Next's notFound() control
  // throw is never swallowed by the error fallback.
  if (!data) {
    notFound();
  }

  return (
    <section className="terminal-page sealed-detail-page">
      <div className="terminal-breadcrumb">
        <Link href={homeHref} prefetch={false}>OWL Market</Link>
        <span aria-hidden="true">›</span>
        <span>Terminal</span>
        <span aria-hidden="true">›</span>
        <Link href={sealedHref} prefetch={false}>Sealed</Link>
        <span aria-hidden="true">›</span>
        <span className="here">{data.product.name}</span>
      </div>

      <SealedDetailClient data={data} />

      {/* ================= §3.3 · MARKET STATS ================= */}
      <section className="sd-blk">
        <div className="sd-blk-head">
          <div>
            <div className="sd-blk-title">
              Market <em className="sd-script">stats</em>
            </div>
          </div>
        </div>
        <div className="sd-stat-grid">
          {/* OFF ATH — from our own rows (same source as the hero range bar). */}
          <div className="sd-stat">
            <div className="sl">OFF ATH</div>
            {data.atAth ? (
              <div className="sv t-up">AT ATH</div>
            ) : (
              <div className={`sv ${deltaCls(data.offAth)}`}>{fmtPct(data.offAth)}</div>
            )}
            <div className="sn">
              {data.ath ? `ATH ${fmtMoney(data.ath.price)} · ${fmtDateFull(data.ath.date)}` : EM}
            </div>
          </div>

          {/* 12W VOLATILITY — mean abs w/w over our rows; short series render
              an em-dash below the minimum, never NaN (§2.3). Volatility
              appears exactly ONCE on this page — never re-read as a supply
              signal (spec §3.3). */}
          <div className="sd-stat">
            <div className="sl">12W VOLATILITY</div>
            <div className="sv">
              {data.volatility12w == null ? EM : `${data.volatility12w.toFixed(1)}%`}
            </div>
            <div className="sn">
              {data.volatility12w != null
                ? `MEAN ABS W/W · ${data.volatilityObs}W`
                : data.volatilityObs > 0
                  ? `ONLY ${data.volatilityObs} W/W OBS`
                  : "NO W/W DATA"}
            </div>
          </div>

          {/* PRICE ACTIVITY — replaces the mockup's SELLERS card; no supply
              signal ships (JustTCG exposes no seller count for sealed). */}
          <div className="sd-stat">
            <div className="sl">PRICE ACTIVITY</div>
            <div className="sv">{data.priceActivity30d} MOVES</div>
            <div className="sn">30D WINDOW · {lastMoveSub(data.lastMoveDays)}</div>
          </div>

          {/* CARDS PER BOX / $ PER PACK hide while packs_per_unit /
              cards_per_pack are null (§9.2) — today's normal, not an edge. */}
          {data.cardsPerBox != null && (
            <div className="sd-stat">
              <div className="sl">CARDS PER BOX</div>
              <div className="sv">{data.cardsPerBox}</div>
              <div className="sn">
                {data.product.packsPerUnit} PACKS × {data.product.cardsPerPack}
              </div>
            </div>
          )}
          {data.pricePerPack != null && (
            <div className="sd-stat">
              <div className="sl">$ PER PACK</div>
              <div className="sv">{fmtMoney2(data.pricePerPack)}</div>
              <div className="sn">
                {data.product.msrpUsd != null && data.product.packsPerUnit
                  ? `MSRP ${fmtMoney2(data.product.msrpUsd / data.product.packsPerUnit)}`
                  : "AT CURRENT BOX PRICE"}
              </div>
            </div>
          )}

          {/* SEALED RANK — computed in the loader per §2.3. */}
          <div className="sd-stat">
            <div className="sl">SEALED RANK</div>
            <div className="sv">{data.sealedRank ? `#${data.sealedRank.rank}` : EM}</div>
            <div className="sn">
              {data.sealedRank
                ? `OF ${data.sealedRank.of} TRACKED · ${productTypeLabel(data.product.productType)}`
                : "NO COHORT PRICES"}
            </div>
          </div>
        </div>
      </section>

      {/* ================= §3.4 · TOP 10 CARDS ================= */}
      <section className="sd-blk">
        <div className="sd-blk-head">
          <div>
            <div className="sd-blk-title">
              What&apos;s <em className="sd-script">inside</em>
            </div>
            <div className="sd-blk-sub">
              TOP 10 CARDS BY MARKET VALUE · WHAT ACTUALLY MOVES THIS SET
            </div>
          </div>
        </div>

        {data.topCards.length === 0 ? (
          <div className="sd-card">
            <div className="sd-chart-empty">NO PRICED CARDS IN THIS SET YET</div>
          </div>
        ) : (
          <>
            {/* Summary strip — set value and both shares use the SAME
                snapshot denominator the hero shows (never a card-sum rollup). */}
            <div className="sd-top10-strip">
              <span>
                TOP 10 COMBINED <b>{fmtMoney(data.top10Combined)}</b>
              </span>
              <span>
                SET VALUE <b>{fmtMoney(data.setValue)}</b>
              </span>
              <span>
                TOP 10 SHARE{" "}
                <b>{data.top10Share == null ? EM : `${data.top10Share.toFixed(1)}%`}</b>
              </span>
              <span className="sd-top10-solo">
                TOP CARD ALONE ={" "}
                {data.topCardShare == null ? EM : `${data.topCardShare.toFixed(1)}%`} OF SET VALUE
              </span>
            </div>

            <div className="sd-inside">
              {data.topCards.map((c, i) => (
                <Link
                  key={c.cardImageId}
                  href={gamePath(gameRouteSlug, `/card/${c.cardImageId}`)}
                  prefetch={false}
                  className="sd-icard"
                >
                  <div className="sd-ic-art">
                    <span className="sd-ic-rank">#{i + 1}</span>
                    {/* RarityBadge takes { rarity } only — sizing/positioning
                        happens here in the parent. Null rarity → no badge. */}
                    <span className="sd-ic-rar">
                      <RarityBadge rarity={c.rarity} />
                    </span>
                    {c.img ? (
                      <FastCardImage
                        className="sd-ic-img"
                        src={c.img}
                        alt={c.name}
                        width={320}
                        height={240}
                        sizes="(max-width: 640px) 45vw, 240px"
                        loading="lazy"
                        fetchPriority="low"
                      />
                    ) : (
                      <span className="sd-ic-noart" aria-hidden="true">
                        {c.cardNumber ?? EM}
                      </span>
                    )}
                  </div>
                  <div className="sd-ic-body">
                    <div className="sd-ic-name">{c.name}</div>
                    <div className="sd-ic-meta">{c.cardNumber ?? EM}</div>
                    <div className="sd-ic-price">{fmtMoney2(c.price)}</div>
                    <div className="sd-ic-line">
                      <span className={deltaCls(c.d7)}>{fmtPct(c.d7)} 7D</span>
                      <span className="sd-ic-share">
                        {" "}
                        · {c.pctOfSet == null ? EM : `${c.pctOfSet.toFixed(1)}%`} OF SET
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Phase G seam — §3.5 Box EV mounts here as a sibling section, BELOW
          the top 10 (spec §3.4: top 10 sits above Box EV). Nothing renders
          for it in Phase F. */}
    </section>
  );
}
