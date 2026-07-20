"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { gamePath } from "@/lib/game-routes";
import type { SetData } from "./sets-data";
import SetThumb from "./SetThumb";
import "./sets.css";

type SortKey = "rank" | "code" | "name" | "price" | "chg1d" | "chg7d" | "chg30d" | "cards";
type SortDir = "asc" | "desc";
type SetType = NonNullable<SetData["type"]>;
type TypeFilter = "all" | SetType;

const TYPE_LABELS: Record<SetType, string> = {
  op: "Booster",
  eb: "Extra Booster",
  prb: "Premium",
  st: "Starter Deck",
  promo: "Promo",
  main: "Main",
  organized: "Organized Play",
  judge: "Judge",
};

const TYPE_ORDER: SetType[] = ["op", "eb", "prb", "main", "st", "promo", "organized", "judge"];

function classify(code: string): SetType {
  if (["OGN", "SFD", "UNL"].includes(code)) return "main";
  if (code === "OGS") return "st";
  if (code === "OPP") return "organized";
  if (code === "JDG") return "judge";
  if (code === "P" || code === "N") return "promo";
  if (code.startsWith("PRB")) return "prb";
  if (code.startsWith("OP")) return "op";
  if (code.startsWith("EB")) return "eb";
  if (code.startsWith("ST")) return "st";
  return "promo";
}

function fmtUsd(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | null) {
  if (v == null) return <span className="sv2-pct flat">—</span>;
  if (v === 0) return <span className="sv2-pct flat">0%</span>;
  const up = v > 0;
  return <span className={`sv2-pct ${up ? "up" : "dn"}`}>{`${up ? "+" : ""}${v}%`}</span>;
}

function isCatalogOnly(set: SetData) {
  return set.pricingStatus === "catalog_only";
}

function hasLivePricing(set: SetData) {
  return !isCatalogOnly(set) && !set.comingSoon && set.cards > 0;
}

function setCardCount(set: SetData) {
  return set.cardsTotal ?? set.cards;
}

function SparkSVG({ data, up, w, h }: { data: number[]; up: boolean; w: number; h: number }) {
  if (!data || data.length < 2) {
    return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} />;
  }
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rng = mx - mn || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - mn) / rng) * (h - pad * 2);
    return [x.toFixed(1), y.toFixed(1)] as [string, string];
  });
  const poly = pts.map((p) => p.join(",")).join(" ");
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const fillPoly = `${first[0]},${h} ${poly} ${last[0]},${h}`;
  const stroke = up ? "#2D9961" : "#E04E4E";
  const fillCol = up ? "rgba(45,153,97,0.16)" : "rgba(224,78,78,0.12)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      <polygon points={fillPoly} fill={fillCol} />
      <polyline points={poly} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}

function HeadlineCard({
  set,
  label,
  icon,
  metric,
  gameRouteSlug,
}: {
  set: SetData;
  label: string;
  icon: string;
  metric: "30d" | "val" | "year" | "cards";
  gameRouteSlug?: string | null;
}) {
  const colorD = set.color + "22";
  const catalogOnly = isCatalogOnly(set);
  let footer: React.ReactNode;
  if (catalogOnly || metric === "cards") {
    footer = (
      <span className="sets-v2-hl-pct neutral" style={{ fontSize: 12 }}>
        Catalog only
      </span>
    );
  } else if (metric === "30d" || metric === "val") {
    const cls = set.chg30d == null || set.chg30d === 0 ? "neutral" : set.chg30d > 0 ? "up" : "dn";
    footer = (
      <span className={`sets-v2-hl-pct ${cls}`}>
        {set.chg30d == null ? "—" : `${set.chg30d > 0 ? "+" : ""}${set.chg30d}%`}{" "}
        <span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 4 }}>30D</span>
      </span>
    );
  } else {
    footer = (
      <span className="sets-v2-hl-pct neutral" style={{ fontSize: 12 }}>
        {set.year ? `Released ${set.year}` : "Release TBD"}
      </span>
    );
  }
  const style = { ["--hl-color" as string]: set.color, ["--hl-color-d" as string]: colorD } as React.CSSProperties;
  return (
    <Link href={gamePath(gameRouteSlug, `/sets/${set.slug}`)} className="sets-v2-hl" style={style} prefetch={false}>
      <div className="sets-v2-hl-glow" />
      <div className="sets-v2-hl-head">
        <span className="sets-v2-hl-label">{label}</span>
        <span className="sets-v2-hl-icon">{icon}</span>
      </div>
      <div className="sets-v2-hl-code-row">
        <span className="sets-v2-hl-code" style={{ color: set.color }}>{set.code}</span>
        {set.year && <span className="sets-v2-hl-year">{set.year}</span>}
      </div>
      <div className="sets-v2-hl-title-row">
        <SetThumb slug={set.slug} code={set.code} color={set.color} imageUrl={set.imageUrl} variant="headline" priority />
        <div className="sets-v2-hl-name">{set.name}</div>
      </div>
      <div className="sets-v2-hl-stat-row">
        <span className="sets-v2-hl-value">
          {catalogOnly || metric === "cards" ? `${setCardCount(set).toLocaleString()} cards` : fmtUsd(set.price)}
        </span>
        {footer}
      </div>
      <div className="sets-v2-hl-spark">
        <SparkSVG data={set.spark} up={(set.chg30d ?? set.chg7d ?? 0) >= 0} w={260} h={32} />
      </div>
    </Link>
  );
}

export default function SetsClient({
  initialSets,
  gameRouteSlug,
  gameName = "One Piece TCG",
  loadError = null,
}: {
  initialSets: SetData[];
  gameRouteSlug?: string | null;
  gameName?: string;
  loadError?: string | null;
}) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("price");
  const [dir, setDir] = useState<SortDir>("desc");

  const sets = initialSets;
  const totalCards = useMemo(() => sets.reduce((acc, s) => acc + (s.cardsTotal ?? s.cards), 0), [sets]);
  const hasPricedSets = useMemo(() => sets.some(hasLivePricing), [sets]);
  const pricingLabel = hasPricedSets ? <>Pricing via <b>JustTCG</b></> : <>Catalog preview</>;

  const typeTabs = useMemo(() => {
    const present = new Set<SetType>();
    for (const s of sets) present.add(s.type ?? classify(s.code));
    const tabs: Array<{ key: TypeFilter; label: string }> = [{ key: "all", label: "All" }];
    for (const type of TYPE_ORDER) {
      if (present.has(type)) tabs.push({ key: type, label: TYPE_LABELS[type] });
    }
    return tabs;
  }, [sets]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const s of sets) if (s.year) ys.add(s.year);
    return Array.from(ys).sort((a, b) => b - a);
  }, [sets]);

  const filtered = useMemo(() => {
    return sets.filter((s) => {
      const t = s.type ?? classify(s.code);
      if (typeFilter !== "all" && t !== typeFilter) return false;
      if (yearFilter !== "all" && String(s.year) !== yearFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.code.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sets, typeFilter, yearFilter, search]);

  const sorted = useMemo(() => {
    const mult = dir === "asc" ? 1 : -1;
    const list = [...filtered];
    list.sort((a, b) => {
      if (sort === "code") return a.code.localeCompare(b.code) * mult;
      if (sort === "name") return a.name.localeCompare(b.name) * mult;
      if (sort === "rank") return 0;
      if (sort === "cards") return (setCardCount(a) - setCardCount(b)) * mult;
      const av = (a[sort] as number | undefined) ?? 0;
      const bv = (b[sort] as number | undefined) ?? 0;
      return (av - bv) * mult;
    });
    return list;
  }, [filtered, sort, dir]);

  const headlineCards = useMemo(() => {
    if (sets.length === 0) return null;
    const live = sets.filter(hasLivePricing);
    const pool = live.length > 0 ? live : sets;
    const bigMover = [...pool].sort((a, b) => {
      if (live.length === 0) return setCardCount(b) - setCardCount(a);
      return Math.abs(b.chg30d ?? 0) - Math.abs(a.chg30d ?? 0);
    })[0]!;
    const mostValuable = [...pool].sort((a, b) => {
      if (live.length === 0) return setCardCount(b) - setCardCount(a);
      return b.price - a.price;
    })[0]!;
    const newest = [...pool].sort((a, b) => {
      const ay = a.year ?? 0;
      const by = b.year ?? 0;
      if (by !== ay) return by - ay;
      return b.code.localeCompare(a.code);
    })[0]!;
    return { bigMover, mostValuable, newest };
  }, [sets]);

  function toggleSort(k: SortKey) {
    if (sort === k) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(k);
      setDir(k === "code" || k === "name" ? "asc" : "desc");
    }
  }

  function sortIndicator(k: SortKey) {
    if (sort !== k) return null;
    return <span className="sets-v2-sort-arrow">{dir === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <section className="sets-v2-page">
      <div className="sets-v2-breadcrumb">
        <Link href="/" prefetch={false}>Moon Market</Link>
        <span className="bsep">›</span>
        <span className="here">Sets</span>
      </div>

      <div className="sets-v2-head">
        <div>
          <div className="sets-v2-head-eyebrow">{gameName}</div>
          <div className="sets-v2-head-title">
            Set <span>Index</span>
          </div>
          <div className="sets-v2-head-sub">
            Browse all {sets.length} tracked sets. Click a row to open a set&rsquo;s deep-dive.
          </div>
        </div>
        <div className="sets-v2-head-meta">
          {pricingLabel}
          <br />
          {totalCards.toLocaleString()} cards tracked
        </div>
      </div>

      {headlineCards && (
        <div className="sets-v2-hl-row">
          <HeadlineCard
            set={headlineCards.bigMover}
            label={hasPricedSets ? "Biggest Mover · 30D" : "Largest Catalog"}
            icon="📈"
            metric={hasPricedSets ? "30d" : "cards"}
            gameRouteSlug={gameRouteSlug}
          />
          <HeadlineCard
            set={headlineCards.mostValuable}
            label={hasPricedSets ? "Highest Index Value" : "Most Cards"}
            icon="💎"
            metric={hasPricedSets ? "val" : "cards"}
            gameRouteSlug={gameRouteSlug}
          />
          <HeadlineCard set={headlineCards.newest} label="Newest Release" icon="🆕" metric="year" gameRouteSlug={gameRouteSlug} />
        </div>
      )}

      <div className="sets-v2-filter">
        <div className="sets-v2-filter-left">
          <div className="sets-v2-f-group">
            {typeTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`sets-v2-f-tab ${typeFilter === t.key ? "on" : ""}`}
                onClick={() => setTypeFilter(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {years.length > 0 && (
            <select className="sets-v2-f-sel" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          )}
        </div>
        <div className="sets-v2-filter-right">
          <input
            type="text"
            className="sets-v2-f-search"
            placeholder="Search set name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="sets-v2-f-count">
            <b>{sorted.length}</b> of {sets.length} sets
          </span>
        </div>
      </div>

      <div className="sets-v2-table-wrap">
        <table className="sets-v2-table">
          <colgroup>
            <col className="c-rank" />
            <col className="c-thumb" />
            <col className="c-code" />
            <col className="c-name" />
            <col className="c-val" />
            <col className="c-d1" />
            <col className="c-d7" />
            <col className="c-d30" />
            <col className="c-cards" />
            <col className="c-spark" />
          </colgroup>
          <thead>
            <tr>
              <th className={`r${sort === "rank" ? " sorted" : ""}`} onClick={() => toggleSort("rank")}>
                # {sortIndicator("rank")}
              </th>
              <th aria-label="Box art" />
              <th className={sort === "code" ? "sorted" : ""} onClick={() => toggleSort("code")}>
                Set {sortIndicator("code")}
              </th>
              <th className={sort === "name" ? "sorted" : ""} onClick={() => toggleSort("name")}>
                Name {sortIndicator("name")}
              </th>
              <th className={`r${sort === "price" ? " sorted" : ""}`} onClick={() => toggleSort("price")}>
                Index Value {sortIndicator("price")}
              </th>
              <th className={`r${sort === "chg1d" ? " sorted" : ""}`} onClick={() => toggleSort("chg1d")}>
                24H {sortIndicator("chg1d")}
              </th>
              <th className={`r${sort === "chg7d" ? " sorted" : ""}`} onClick={() => toggleSort("chg7d")}>
                7D {sortIndicator("chg7d")}
              </th>
              <th className={`r${sort === "chg30d" ? " sorted" : ""}`} onClick={() => toggleSort("chg30d")}>
                30D {sortIndicator("chg30d")}
              </th>
              <th className={`r${sort === "cards" ? " sorted" : ""}`} onClick={() => toggleSort("cards")}>
                Cards {sortIndicator("cards")}
              </th>
              <th className="r">7D Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", color: "var(--ink-3)", padding: 40 }}>
                  {loadError ?? "No sets match these filters."}
                </td>
              </tr>
            ) : (
              sorted.map((s, i) => {
                const catalogOnly = isCatalogOnly(s);
                const empty = !hasLivePricing(s);
                const cardCount = setCardCount(s);
                return (
                  <tr key={s.code} onClick={() => router.push(gamePath(gameRouteSlug, `/sets/${s.slug}`))}>
                    <td className="sv2-rank">{i + 1}</td>
                    <td className="sv2-thumb-cell">
                      <SetThumb slug={s.slug} code={s.code} color={s.color} imageUrl={s.imageUrl} variant="table" />
                    </td>
                    <td>
                      <div className="sv2-code-cell">
                        <span className="sv2-dot" style={{ background: s.color }} />
                        <span className="sv2-code">{s.code}</span>
                        {s.year && <span className="sv2-year">{s.year}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="sv2-name">
                        {s.name}
                        {catalogOnly ? (
                          <span className="sv2-coming-soon">Catalog only</span>
                        ) : (
                          empty && <span className="sv2-coming-soon">Coming Soon</span>
                        )}
                        <span className="sv2-row-arrow">→</span>
                      </div>
                    </td>
                    <td className={`sv2-val${empty ? " muted" : ""}`}>{empty ? "—" : fmtUsd(s.price)}</td>
                    <td>{empty ? <span className="sv2-pct flat">—</span> : fmtPct(s.chg1d)}</td>
                    <td>{empty ? <span className="sv2-pct flat">—</span> : fmtPct(s.chg7d)}</td>
                    <td>{empty ? <span className="sv2-pct flat">—</span> : fmtPct(s.chg30d)}</td>
                    <td className="sv2-cards">{cardCount.toLocaleString()}</td>
                    <td className="sv2-spark">
                      {empty ? <span style={{ color: "var(--ink-3)" }}>—</span> : <SparkSVG data={s.spark} up={(s.chg30d ?? s.chg7d ?? 0) >= 0} w={100} h={22} />}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="sets-v2-note">
        <div>
          {loadError ? (
            loadError
          ) : hasPricedSets ? (
            <>
              Index Value = sum of average market prices for every priced card in the set. Skewed by chase-card concentration.{" "}
              <a href="#">Read methodology →</a>
            </>
          ) : (
            "Catalog-only preview shows imported set and card counts. Pricing and market movement stay hidden until a provider is enabled."
          )}
        </div>
        <div>
          {sets.length} sets · {totalCards.toLocaleString()} cards tracked
        </div>
      </div>
    </section>
  );
}
