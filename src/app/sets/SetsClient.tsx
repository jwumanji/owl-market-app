"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SetData } from "./sets-data";
import SetThumb from "./SetThumb";
import "./sets.css";

type SortKey = "rank" | "code" | "name" | "price" | "chg1d" | "chg7d" | "chg30d" | "cards";
type SortDir = "asc" | "desc";
type TypeFilter = "all" | "op" | "eb" | "prb" | "st" | "promo";

const TYPE_TABS: Array<{ key: TypeFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "op", label: "Booster" },
  { key: "eb", label: "Extra Booster" },
  { key: "prb", label: "Premium" },
  { key: "st", label: "Starter Deck" },
  { key: "promo", label: "Promo" },
];

function classify(code: string): TypeFilter {
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

function fmtPct(v: number) {
  if (v === 0) return <span className="sv2-pct flat">0%</span>;
  const up = v > 0;
  return <span className={`sv2-pct ${up ? "up" : "dn"}`}>{`${up ? "+" : ""}${v}%`}</span>;
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
}: {
  set: SetData;
  label: string;
  icon: string;
  metric: "30d" | "val" | "year";
}) {
  const colorD = set.color + "22";
  let footer: React.ReactNode;
  if (metric === "30d" || metric === "val") {
    const cls = set.chg30d === 0 ? "neutral" : set.chg30d >= 0 ? "up" : "dn";
    footer = (
      <span className={`sets-v2-hl-pct ${cls}`}>
        {set.chg30d === 0 ? "" : set.chg30d > 0 ? "+" : ""}{set.chg30d}%{" "}
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
    <Link href={`/sets/${set.slug}`} className="sets-v2-hl" style={style}>
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
        <SetThumb slug={set.slug} code={set.code} color={set.color} variant="headline" />
        <div className="sets-v2-hl-name">{set.name}</div>
      </div>
      <div className="sets-v2-hl-stat-row">
        <span className="sets-v2-hl-value">{fmtUsd(set.price)}</span>
        {footer}
      </div>
      <div className="sets-v2-hl-spark">
        <SparkSVG data={set.spark} up={set.chg30d >= 0} w={260} h={32} />
      </div>
    </Link>
  );
}

export default function SetsClient({ initialSets }: { initialSets: SetData[] }) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("price");
  const [dir, setDir] = useState<SortDir>("desc");

  const sets = initialSets;
  const totalCards = useMemo(() => sets.reduce((acc, s) => acc + (s.cardsTotal ?? s.cards), 0), [sets]);

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
      const av = (a[sort] as number | undefined) ?? 0;
      const bv = (b[sort] as number | undefined) ?? 0;
      return (av - bv) * mult;
    });
    return list;
  }, [filtered, sort, dir]);

  const headlineCards = useMemo(() => {
    if (sets.length === 0) return null;
    const live = sets.filter((s) => !s.comingSoon && s.cards > 0);
    const pool = live.length > 0 ? live : sets;
    const bigMover = [...pool].sort((a, b) => Math.abs(b.chg30d) - Math.abs(a.chg30d))[0]!;
    const mostValuable = [...pool].sort((a, b) => b.price - a.price)[0]!;
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
        <Link href="/">OWL Market</Link>
        <span className="bsep">›</span>
        <span className="here">Sets</span>
      </div>

      <div className="sets-v2-head">
        <div>
          <div className="sets-v2-head-eyebrow">One Piece TCG</div>
          <div className="sets-v2-head-title">
            Set <span>Index</span>
          </div>
          <div className="sets-v2-head-sub">
            Browse all {sets.length} tracked sets. Click a row to open a set&rsquo;s deep-dive.
          </div>
        </div>
        <div className="sets-v2-head-meta">
          Pricing via <b>JustTCG</b>
          <br />
          {totalCards.toLocaleString()} cards tracked
        </div>
      </div>

      {headlineCards && (
        <div className="sets-v2-hl-row">
          <HeadlineCard set={headlineCards.bigMover} label="Biggest Mover · 30D" icon="📈" metric="30d" />
          <HeadlineCard set={headlineCards.mostValuable} label="Highest Index Value" icon="💎" metric="val" />
          <HeadlineCard set={headlineCards.newest} label="Newest Release" icon="🆕" metric="year" />
        </div>
      )}

      <div className="sets-v2-filter">
        <div className="sets-v2-filter-left">
          <div className="sets-v2-f-group">
            {TYPE_TABS.map((t) => (
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
                  No sets match these filters.
                </td>
              </tr>
            ) : (
              sorted.map((s, i) => {
                const empty = s.comingSoon || s.cards === 0;
                return (
                  <tr key={s.code} onClick={() => router.push(`/sets/${s.slug}`)}>
                    <td className="sv2-rank">{i + 1}</td>
                    <td className="sv2-thumb-cell">
                      <SetThumb slug={s.slug} code={s.code} color={s.color} variant="table" />
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
                        {empty && <span className="sv2-coming-soon">Coming Soon</span>}
                        <span className="sv2-row-arrow">→</span>
                      </div>
                    </td>
                    <td className={`sv2-val${empty ? " muted" : ""}`}>{empty ? "—" : fmtUsd(s.price)}</td>
                    <td>{empty ? <span className="sv2-pct flat">—</span> : fmtPct(s.chg1d)}</td>
                    <td>{empty ? <span className="sv2-pct flat">—</span> : fmtPct(s.chg7d)}</td>
                    <td>{empty ? <span className="sv2-pct flat">—</span> : fmtPct(s.chg30d)}</td>
                    <td className="sv2-cards">{empty ? "—" : s.cards}</td>
                    <td className="sv2-spark">
                      {empty ? <span style={{ color: "var(--ink-3)" }}>—</span> : <SparkSVG data={s.spark} up={s.chg30d >= 0} w={100} h={22} />}
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
          Index Value = sum of average market prices for every priced card in the set. Skewed by chase-card concentration.{" "}
          <a href="#">Read methodology →</a>
        </div>
        <div>
          {sets.length} sets · {totalCards.toLocaleString()} cards tracked
        </div>
      </div>
    </section>
  );
}
