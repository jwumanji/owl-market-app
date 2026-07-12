"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FastCardImage from "@/components/ui/FastCardImage";
import { TIER_LABELS } from "./characters-data";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { characterMatchesSearch } from "@/lib/character-search";
import "./characters-page.css";

/* ── Types ── */
export interface CharacterCard {
  name: string;
  set: string;
  rarity: string;
  tcg: number;
  avg: number;
  chg1d: number | null;
  chg7d: number | null;
  chg30d: number | null;
  spark: number[];
  imageUrl?: string | null;
  imageUrlSmall?: string | null;
  imageUrlPreview?: string | null;
  cardImageId?: string | null;
}

export interface CharacterData {
  slug: string;
  name: string;
  subtitle: string;
  faction: string;
  tier: number;
  indexValue: number;
  cardCount: number;
  chg7d: number | null;
  chg30d: number | null;
  up: boolean;
  topCards: CharacterCard[];
  // assigned server-side (accent palette + generated spark):
  color?: string;
  colorD?: string;
  colorBd?: string;
  spark?: number[];
}

function gameDisplayName(gameRouteSlug: string) {
  if (gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG) return "One Piece TCG";
  return gameRouteSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatChange(value: number | null, showPlus = true) {
  if (value == null) return "—";
  return `${showPlus && value > 0 ? "+" : ""}${value}%`;
}

function changeColor(value: number | null) {
  if (value == null || value === 0) return "var(--ink-3)";
  return value > 0 ? "var(--gain-2)" : "var(--loss-2)";
}

function changeClass(value: number | null) {
  if (value == null || value === 0) return "flat";
  return value > 0 ? "up" : "dn";
}

function rarityClass(rarity: string): string {
  const r = rarity.toUpperCase();
  if (r.includes("MANGA") || r === "MR") return "rb-mr";
  if (r.includes("GOLDEN") || r === "GMR") return "rb-gmr";
  if (r.includes("SECRET") || r === "SEC") return "rb-sec";
  if (r.includes("SPECIAL") || r === "SP") return "rb-sp";
  if (r.includes("TREAS") || r === "TR") return "rb-tr";
  if (r.includes("ALT") || r === "AA") return "rb-aa";
  if (r.includes("SUPER") || r === "SR") return "rb-sr";
  if (r.includes("LEADER")) return "rb-sr";
  return "rb-r";
}

/** Get character avatar from their top card image */
function getCharAvatar(c: CharacterData): string | null {
  const firstCard = c.topCards?.[0];
  return firstCard?.imageUrlSmall ?? firstCard?.imageUrlPreview ?? firstCard?.imageUrl ?? null;
}

/* ── SVG Sparkline ── */
function sparkPoints(data: number[], W: number, H: number, pad: number) {
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const rng = mx - mn || 1;
  return data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - mn) / rng) * (H - pad * 2);
    return [+x.toFixed(1), +y.toFixed(1)] as [number, number];
  });
}

function SparkSvg({ data, up, w, h, pad }: { data: number[]; up: boolean; w: number; h: number; pad: number }) {
  const pts = sparkPoints(data, w, h, pad);
  const poly = pts.map((p) => p.join(",")).join(" ");
  const fill = `${pts[0][0]},${h} ${poly} ${pts[pts.length - 1][0]},${h}`;
  const s = up ? "#2D9961" : "#E04E4E";
  const f = up ? "rgba(45,153,97,0.16)" : "rgba(224,78,78,0.12)";
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <polygon points={fill} fill={f} />
      <polyline points={poly} fill="none" stroke={s} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={3.5} fill={s} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function RowSpark({ data, up }: { data: number[]; up: boolean }) {
  const pts = sparkPoints(data, 88, 22, 2);
  const poly = pts.map((p) => p.join(",")).join(" ");
  const fill = `${pts[0][0]},22 ${poly} ${pts[pts.length - 1][0]},22`;
  const s = up ? "#2D9961" : "#E04E4E";
  const f = up ? "rgba(45,153,97,0.16)" : "rgba(224,78,78,0.12)";
  const [lx, ly] = pts[pts.length - 1];
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <svg width={88} height={22} viewBox="0 0 88 22" style={{ display: "block", overflow: "visible" }}>
        <polygon points={fill} fill={f} />
        <polyline points={poly} fill="none" stroke={s} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lx} cy={ly} r={2.5} fill={s} />
      </svg>
    </div>
  );
}

/* ── Character Avatar ── */
function CharAvatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (src) {
    return (
      <FastCardImage
        src={src}
        alt={name}
        width={size}
        height={Math.round(size * 1.4)}
        loading="lazy"
        fetchPriority="low"
        sizes={`${size}px`}
        className="ch-avatar-img"
        style={{ width: size, height: Math.round(size * 1.4) }}
      />
    );
  }
  return (
    <div
      className="ch-avatar-placeholder"
      style={{ width: size, height: Math.round(size * 1.4), fontSize: Math.round(size * 0.35) }}
    >
      {initials}
    </div>
  );
}

/* ── Card Image with Hover Preview ── */
function CardImageCell({ card }: { card: CharacterCard }) {
  const [showPreview, setShowPreview] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShowPreview(true), 300);
  };
  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowPreview(false);
  };
  const imgSrc = card.imageUrlSmall ?? card.imageUrl;
  const fullSrc = card.imageUrlPreview ?? card.imageUrl ?? card.imageUrlSmall;

  return (
    <div
      className="ch-card-img-cell"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {imgSrc ? (
        <FastCardImage src={imgSrc} alt={card.name} width={32} height={45} sizes="32px" loading="lazy" fetchPriority="low" className="ch-card-thumb" />
      ) : (
        <div className="ch-card-thumb-placeholder" />
      )}
      {showPreview && fullSrc && (
        <div className="ch-card-hover-preview">
          <FastCardImage src={fullSrc} alt={card.name} width={200} height={280} sizes="200px" loading="lazy" />
        </div>
      )}
    </div>
  );
}

/* ── Character Ranking Card (top row) ── */
function RankCard({ c, rank, active, onClick }: { c: CharacterData; rank: number; active: boolean; onClick: () => void }) {
  const tier = TIER_LABELS[c.tier] || TIER_LABELS[3];
  const color = c.color || "#E89512";
  const avatar = getCharAvatar(c);
  return (
    <div
      className="ch-rank-card"
      style={{
        ["--ch-color" as string]: color,
        ...(active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}, 0 6px 20px rgba(0,0,0,0.35)` } : {}),
      }}
      onClick={onClick}
    >
      <div className="ch-rank-top">
        <span className="ch-rank-num">#{rank}</span>
        <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>{tier.label}</span>
      </div>
      <div className="ch-rank-name-row">
        <CharAvatar src={avatar} name={c.name} size={24} />
        <div style={{ minWidth: 0 }}>
          <div className="ch-rank-name">{c.name}</div>
          <div className="ch-rank-sub">{c.subtitle}</div>
        </div>
      </div>
      <div className="ch-rank-price">${c.indexValue.toLocaleString()}</div>
      <div
        className="ch-rank-chg"
        style={{ color: changeColor(c.chg7d) }}
      >
        {c.chg7d == null ? "—" : <>{c.chg7d === 0 ? "" : c.chg7d > 0 ? "↑" : "↓"} {Math.abs(c.chg7d)}%</>} <span className="ch-rank-period">7D</span>
      </div>
      <div className="ch-rank-spark">
        <SparkSvg data={c.spark || [0, 0]} up={c.up} w={200} h={28} pad={3} />
      </div>
    </div>
  );
}

/* ── Search + All Characters Toolbar ── */
function CharToolbar({
  search,
  onSearchChange,
  characters,
  activeSlug,
  onSelect,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  characters: CharacterData[];
  activeSlug: string;
  onSelect: (slug: string) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sorted = [...characters].sort((a, b) => a.name.localeCompare(b.name));

  // Filter dropdown by search text
  const filtered = search.trim()
    ? sorted.filter((ch) => characterMatchesSearch(ch, search))
    : sorted;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <div className="ch-toolbar">
      {/* Search */}
      <div className="ch-search-wrap">
        <svg className="ch-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          className="ch-search-input"
          placeholder="Search characters..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button className="ch-search-clear" onClick={() => onSearchChange("")}>&times;</button>
        )}
      </div>

      {/* All Characters Dropdown */}
      <div className="ch-dropdown-wrap" ref={dropdownRef}>
        <button
          className={`ch-dropdown-btn${dropdownOpen ? " open" : ""}`}
          onClick={() => setDropdownOpen((o) => !o)}
        >
          All Characters
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={dropdownOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="ch-dropdown-menu">
            {filtered.length === 0 && (
              <div className="ch-dropdown-empty">No characters found</div>
            )}
            {filtered.map((ch) => (
              <div
                key={ch.slug}
                className={`ch-dropdown-item${ch.slug === activeSlug ? " active" : ""}`}
                onClick={() => {
                  onSelect(ch.slug);
                  setDropdownOpen(false);
                }}
              >
                <span className="ch-dropdown-item-name">{ch.name}</span>
                <span className="ch-dropdown-item-val">${ch.indexValue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Character Detail Panel ── */
function CharacterDetail({ c }: { c: CharacterData }) {
  const tier = TIER_LABELS[c.tier] || TIER_LABELS[3];
  const color = c.color || "#E89512";
  const avatar = getCharAvatar(c);
  // The detail portrait renders at 80px wide, so prefer the thumbnail and
  // avoid downloading a much larger preview image during initial paint.
  const fullImg = c.topCards?.[0]?.imageUrlSmall ?? c.topCards?.[0]?.imageUrlPreview ?? c.topCards?.[0]?.imageUrl ?? null;
  return (
    <div className="ch-detail">
      <div className="ch-detail-header" style={{ background: `linear-gradient(135deg,${c.colorD || "rgba(232,149,18,0.16)"},transparent)` }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${color},transparent)` }} />
        <div className="ch-detail-header-inner">
          {fullImg ? (
            <FastCardImage src={fullImg} alt={c.name} className="ch-detail-avatar" width={80} height={112} sizes="80px" loading="lazy" />
          ) : avatar ? (
            <FastCardImage src={avatar} alt={c.name} className="ch-detail-avatar" width={80} height={112} sizes="80px" loading="lazy" />
          ) : (
            <div className="ch-detail-avatar-placeholder">
              {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="ch-detail-header-info">
            <div className="ch-detail-badges">
              <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>Tier {tier.label}</span>
              <span className="ch-faction-badge">{c.faction}</span>
            </div>
            <div className="ch-detail-name">{c.name}</div>
            <div className="ch-detail-sub">{c.subtitle}</div>
          </div>
        </div>
      </div>
      <div className="ch-detail-stats">
        {[
          ["Character Index", `$${c.indexValue.toLocaleString()}`, color],
          ["7D Change", formatChange(c.chg7d), changeColor(c.chg7d)],
          ["30D Change", formatChange(c.chg30d), changeColor(c.chg30d)],
          ["Cards Tracked", String(c.cardCount), undefined],
        ].map(([k, v, clr]) => (
          <div className="ch-stat-row" key={k}>
            <span className="ch-stat-key">{k}</span>
            <span className="ch-stat-val" style={clr ? { color: clr } : undefined}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Character Cards Table ── */
function CharacterCards({ c, gameRouteSlug }: { c: CharacterData; gameRouteSlug: string }) {
  const router = useRouter();

  const openCard = useCallback(
    (card: CharacterCard) => {
      if (card.cardImageId) {
        router.push(gamePath(gameRouteSlug, `/card/${card.cardImageId}`));
      }
    },
    [gameRouteSlug, router]
  );

  return (
    <div className="ch-cards-section">
      <div className="section-header">
        <div>
          <div className="section-title">Top Cards &mdash; <span style={{ color: c.color }}>{c.name}</span></div>
          <div className="section-sub">Top {c.topCards.length} highest value cards across all sets</div>
        </div>
        <Link href={gamePath(gameRouteSlug, "/markets")} className="section-action">View all in markets &rarr;</Link>
      </div>
      <div className="cards-table-wrap">
        <table className="cards-table">
          <colgroup>
            <col className="c0" /><col className="c-img" /><col className="c1" /><col className="c2" /><col className="c3" />
            <col className="c4" /><col className="c5" /><col className="c6" /><col className="c7" /><col className="c8" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th><th></th><th>Card</th><th>Rarity</th><th className="r">Avg Price</th>
              <th className="r">TCGPlayer</th><th className="r">24H</th><th className="r">7D</th>
              <th className="r">30D</th><th className="r">Last 7 Days</th>
            </tr>
          </thead>
          <tbody>
            {c.topCards.map((card, i) => (
              <tr
                key={i}
                className={card.cardImageId ? "ch-card-clickable" : ""}
                onClick={card.cardImageId ? () => openCard(card) : undefined}
                onKeyDown={
                  card.cardImageId
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCard(card);
                        }
                      }
                    : undefined
                }
                role={card.cardImageId ? "link" : undefined}
                tabIndex={card.cardImageId ? 0 : undefined}
              >
                <td className="rank-n">{i + 1}</td>
                <td className="ch-card-img-td">
                  <CardImageCell card={card} />
                </td>
                <td>
                  <div className="card-cell">
                    <div style={{ minWidth: 0 }}>
                      <div className="card-name">{card.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                        <span className="card-set-tag">{card.set}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td><span className={`rb ${rarityClass(card.rarity)}`}>{card.rarity}</span></td>
                <td className="price-r">${card.avg.toFixed(2)}</td>
                <td className="price-r">${card.tcg}</td>
                <td className={`chg-r ${changeClass(card.chg1d)}`}>{formatChange(card.chg1d)}</td>
                <td className={`chg-r ${changeClass(card.chg7d)}`}>{formatChange(card.chg7d)}</td>
                <td className={`chg-r ${changeClass(card.chg30d)}`}>{formatChange(card.chg30d)}</td>
                <td><RowSpark data={card.spark} up={(card.chg7d ?? card.chg30d ?? 0) >= 0} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── All Characters Grid ── */
function AllCharactersGrid({ chars, activeSlug, onSelect }: { chars: CharacterData[]; activeSlug: string; onSelect: (slug: string) => void }) {
  return (
    <div className="ch-all-section">
      <div className="section-header">
        <div>
          <div className="section-title">All Character <span>Rankings</span></div>
          <div className="section-sub">30-day performance index for every tracked character</div>
        </div>
      </div>
      <div className="ch-all-grid">
        {chars.map((c, i) => {
          const tier = TIER_LABELS[c.tier] || TIER_LABELS[3];
          const avatar = getCharAvatar(c);
          return (
            <div
              key={c.slug}
              className="ch-grid-card"
              onClick={() => onSelect(c.slug)}
              style={activeSlug === c.slug ? { borderColor: c.color, boxShadow: `0 0 0 1px ${c.color}` } : undefined}
            >
              <div className="ch-grid-top">
                <div className="ch-grid-rank-row">
                  <span className="ch-grid-rank">#{i + 1}</span>
                  <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>{tier.label}</span>
                </div>
                <span
                  className="ch-grid-chg"
                  style={{ color: changeColor(c.chg30d) }}
                >
                  {formatChange(c.chg30d)}
                </span>
              </div>
              <div className="ch-grid-name-row">
                <CharAvatar src={avatar} name={c.name} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div className="ch-grid-name">{c.name}</div>
                  <div className="ch-grid-sub">{c.subtitle}</div>
                </div>
              </div>
              <div className="ch-grid-val">${c.indexValue.toLocaleString()}</div>
              <div className="ch-grid-meta">{c.cardCount} cards &middot; {c.faction}</div>
              <div className="ch-grid-spark">
                <SparkSvg data={c.spark || [0, 0]} up={c.up} w={200} h={48} pad={4} />
              </div>
              <div className="ch-grid-footer">
                <div className="ch-grid-stat">7D <span style={{ color: changeColor(c.chg7d) }}>{formatChange(c.chg7d)}</span></div>
                <div className="ch-grid-stat">30D <span style={{ color: changeColor(c.chg30d) }}>{formatChange(c.chg30d)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page (client shell — data arrives server-loaded via props) ── */

const ALL_CHARACTER_BATCH_SIZE = 60;

export default function CharactersClient({
  characters,
  gameRouteSlug,
}: {
  characters: CharacterData[];
  gameRouteSlug: string;
}) {
  const [availableCharacters, setAvailableCharacters] = useState(characters);
  const [searchResults, setSearchResults] = useState<CharacterData[]>([]);
  const [activeChar, setActiveChar] = useState(characters[0]?.slug ?? "");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [visibleAllCount, setVisibleAllCount] = useState(ALL_CHARACTER_BATCH_SIZE);
  const [detailsBySlug, setDetailsBySlug] = useState<Record<string, CharacterData>>({});
  const detailRequests = useRef(new Set<string>());
  const overviewRequested = useRef(false);
  const searchRequestId = useRef(0);

  const activePool = search.trim() && searchResults.length > 0 ? searchResults : availableCharacters;
  const baseCharacter = activePool.find((x) => x.slug === activeChar) || activePool[0];
  const c = baseCharacter && detailsBySlug[baseCharacter.slug]
    ? { ...baseCharacter, ...detailsBySlug[baseCharacter.slug] }
    : baseCharacter;
  const hasCharacters = Boolean(c);

  useEffect(() => {
    if (!baseCharacter || detailsBySlug[baseCharacter.slug]) return;
    const expectedTopCards = Math.min(5, baseCharacter.cardCount);
    if (baseCharacter.topCards.length >= expectedTopCards) return;
    if (detailRequests.current.has(baseCharacter.slug)) return;
    detailRequests.current.add(baseCharacter.slug);
    let cancelled = false;

    fetch(`/api/characters?game=${encodeURIComponent(gameRouteSlug)}&slug=${encodeURIComponent(baseCharacter.slug)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Character detail request failed (${response.status})`);
        return response.json() as Promise<CharacterData>;
      })
      .then((detail) => {
        if (!cancelled) setDetailsBySlug((current) => ({ ...current, [detail.slug]: detail }));
      })
      .catch(() => {
        // The overview remains usable if an on-demand detail request fails.
      })
      .finally(() => detailRequests.current.delete(baseCharacter.slug));

    return () => {
      cancelled = true;
    };
  }, [baseCharacter, detailsBySlug, gameRouteSlug]);

  const ensureFullOverview = useCallback(() => {
    if (overviewRequested.current) return;
    overviewRequested.current = true;
    fetch(`/api/characters?game=${encodeURIComponent(gameRouteSlug)}&view=overview`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Character overview request failed (${response.status})`);
        return response.json() as Promise<CharacterData[]>;
      })
      .then((overview) => {
        setAvailableCharacters((current) => {
          const currentBySlug = new Map(current.map((character) => [character.slug, character]));
          return overview.map((character) => {
            const existing = currentBySlug.get(character.slug);
            return existing
              ? { ...character, ...existing }
              : { ...character, spark: [0, Number(character.chg7d ?? 0)] };
          });
        });
      })
      .catch(() => {
        overviewRequested.current = false;
      });
  }, [gameRouteSlug]);

  useEffect(() => {
    const query = search.trim();
    const requestId = ++searchRequestId.current;

    if (!query) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      fetch(`/api/characters?game=${encodeURIComponent(gameRouteSlug)}&q=${encodeURIComponent(query)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`Character search request failed (${response.status})`);
          return response.json() as Promise<CharacterData[]>;
        })
        .then((matches) => {
          if (searchRequestId.current !== requestId) return;
          const hydratedMatches = matches.map((character) => ({
            ...character,
            spark: character.spark ?? [0, Number(character.chg7d ?? 0)],
          }));
          setSearchResults(hydratedMatches);
          if (hydratedMatches[0]) setActiveChar(hydratedMatches[0].slug);
        })
        .catch(() => {
          if (searchRequestId.current === requestId) setSearchResults([]);
        });
    }, 125);

    return () => window.clearTimeout(timer);
  }, [gameRouteSlug, search]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const selectChar = useCallback((slug: string) => {
    setActiveChar(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const top10 = availableCharacters.slice(0, 10);
  const filteredChars = search.trim() ? searchResults : availableCharacters;


  return (
    <>
      {!hasCharacters ? (
        <div className="ch-detail" style={{ padding: 28, textAlign: "center" }}>
          <div className="ch-detail-name">No character index yet</div>
          <div className="ch-detail-sub" style={{ marginTop: 8 }}>
            {gameDisplayName(gameRouteSlug)} has catalog data loaded, but no character taxonomy or pricing index is enabled yet.
          </div>
          <div style={{ marginTop: 18 }}>
            <Link href={gamePath(gameRouteSlug, "/catalog")} className="section-action">
              Open catalog &rarr;
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Search + All Characters Dropdown */}
          <CharToolbar
            search={search}
            onSearchChange={handleSearchChange}
            characters={search.trim() ? searchResults : availableCharacters}
            activeSlug={activeChar}
            onSelect={selectChar}
          />

          {/* Top 10 Rank Cards */}
          <div className="ch-rank-row">
            {top10.map((ch, i) => (
              <RankCard key={ch.slug} c={ch} rank={i + 1} active={activeChar === ch.slug} onClick={() => selectChar(ch.slug)} />
            ))}
          </div>

          {/* Detail + Cards */}
          <div className="ch-detail-section">
            <CharacterDetail c={c} />
            <CharacterCards c={c} gameRouteSlug={gameRouteSlug} />
          </div>

          {/* See All Characters Button / Grid */}
          {!showAll ? (
            <div className="ch-see-all-wrap">
              <button className="ch-see-all-btn" onClick={() => { setVisibleAllCount(ALL_CHARACTER_BATCH_SIZE); setShowAll(true); ensureFullOverview(); }}>
                See All Characters
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <AllCharactersGrid
                chars={filteredChars.slice(0, visibleAllCount)}
                activeSlug={activeChar}
                onSelect={selectChar}
              />
              {visibleAllCount < filteredChars.length && (
                <div className="ch-see-all-wrap">
                  <button
                    className="ch-see-all-btn"
                    onClick={() => setVisibleAllCount((count) => count + ALL_CHARACTER_BATCH_SIZE)}
                  >
                    Load More Characters
                  </button>
                </div>
              )}
              <div className="ch-see-all-wrap">
                <button className="ch-see-all-btn" onClick={() => setShowAll(false)}>
                  Collapse
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
