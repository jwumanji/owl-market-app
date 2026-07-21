"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import FastCardImage from "@/components/ui/FastCardImage";
import { TIER_LABELS } from "./characters-data";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { characterMatchesSearch } from "@/lib/character-search";
import { cardImageSources } from "@/lib/card-image-variants";
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
  if (!firstCard) return null;

  // Rank cards render this artwork across the full card width, so the tiny
  // thumbnail variant looks visibly pixelated. Prefer the preview-sized asset
  // and retain the thumbnail as a last-resort fallback.
  return cardImageSources(firstCard, "preview")[0] ?? null;
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

/* ── Character Ranking Card (top row) ── */
function RankCard({ c, rank, active, onClick }: { c: CharacterData; rank: number; active: boolean; onClick: () => void }) {
  const tier = TIER_LABELS[c.tier] || TIER_LABELS[3];
  const color = c.color || "#E89512";
  const avatar = getCharAvatar(c);
  return (
    <button
      type="button"
      className="ch-rank-card"
      aria-label={`Open ${c.name} character details`}
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
      <div className="ch-rank-title">
        <div className="ch-rank-name">{c.name}</div>
        <div className="ch-rank-sub">{c.subtitle}</div>
      </div>
      <div className="ch-rank-body">
        <div className="ch-rank-image">
          <CharAvatar src={avatar} name={c.name} size={200} />
        </div>
        <div className="ch-rank-market">
          <div className="ch-rank-market-line">
            <div className="ch-rank-price">${c.indexValue.toLocaleString()}</div>
            <div
              className="ch-rank-chg"
              style={{ color: changeColor(c.chg7d) }}
            >
              {c.chg7d == null ? "—" : <>{c.chg7d === 0 ? "" : c.chg7d > 0 ? "↑" : "↓"} {Math.abs(c.chg7d)}%</>} <span className="ch-rank-period">7D</span>
            </div>
          </div>
          <div className="ch-rank-spark">
            <SparkSvg data={c.spark || [0, 0]} up={c.up} w={200} h={34} pad={3} />
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Search + All Characters Toolbar ── */
function CharToolbar({
  search,
  onSearchChange,
  characters,
  activeSlug,
  onSelect,
  onViewAll,
  viewAllLabel,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  characters: CharacterData[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  onViewAll: () => void;
  viewAllLabel: string;
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
      <button type="button" className="ch-toolbar-view-all" onClick={onViewAll}>
        {viewAllLabel}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

/* ── Character Card Showcase ── */
function CharacterTopCard({
  card,
  rank,
  gameRouteSlug,
}: {
  card: CharacterCard;
  rank: number;
  gameRouteSlug: string;
}) {
  const imageSrc = card.imageUrlPreview ?? card.imageUrlSmall ?? card.imageUrl;
  const content = (
    <>
      <div className="ch-showcase-image">
        <span className="ch-showcase-rank">#{rank}</span>
        <span className={`rb ${rarityClass(card.rarity)} ch-showcase-rarity`}>{card.rarity}</span>
        {imageSrc ? (
          <FastCardImage
            src={imageSrc}
            alt={card.name}
            width={256}
            height={358}
            sizes="(max-width: 620px) 45vw, (max-width: 920px) 30vw, 190px"
            loading={rank <= 2 ? "eager" : "lazy"}
            fetchPriority={rank === 1 ? "high" : "low"}
          />
        ) : (
          <div className="ch-showcase-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="ch-showcase-copy">
        <div className="ch-showcase-name" title={card.name}>{card.name}</div>
        <div className="ch-showcase-set">{card.set || "Unknown set"}</div>
        <div className="ch-showcase-market">
          <div>
            <span className="ch-showcase-label">Avg price</span>
            <strong className="ch-showcase-price">${card.avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
          <div className="ch-showcase-change">
            <span className="ch-showcase-label">7D</span>
            <strong style={{ color: changeColor(card.chg7d) }}>{formatChange(card.chg7d)}</strong>
          </div>
        </div>
      </div>
    </>
  );

  return card.cardImageId ? (
    <Link href={gamePath(gameRouteSlug, `/card/${card.cardImageId}`)} className="ch-showcase-card">
      {content}
    </Link>
  ) : (
    <div className="ch-showcase-card">{content}</div>
  );
}

function CharacterCards({ c, gameRouteSlug }: { c: CharacterData; gameRouteSlug: string }) {
  const tier = TIER_LABELS[c.tier] || TIER_LABELS[3];
  const avatar = getCharAvatar(c);
  const indexValue = c.indexValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="ch-cards-section">
      <div className="ch-character-strip">
        <div className="ch-cards-identity">
          <CharAvatar src={avatar} name={c.name} size={48} />
          <div className="ch-cards-identity-copy">
            <span className="ch-cards-character-name" style={{ color: c.color }}>{c.name}</span>
            <span className="ch-cards-subtitle">{c.subtitle}</span>
            <div className="ch-cards-badges">
              <span className="ch-tier-badge" style={{ background: tier.bg, color: tier.color }}>Tier {tier.label}</span>
              <span className="ch-faction-badge">{c.faction}</span>
            </div>
          </div>
        </div>
        <div className="ch-index-stat">
          <span className="ch-cards-stat-label">Character Index</span>
          <strong className="ch-index-value">${indexValue}</strong>
        </div>
        <div className="ch-cards-stats">
          <div className="ch-cards-stat">
            <span className="ch-cards-stat-label">7D</span>
            <span className="ch-cards-stat-value" style={{ color: changeColor(c.chg7d) }}>{formatChange(c.chg7d)}</span>
          </div>
          <div className="ch-cards-stat">
            <span className="ch-cards-stat-label">30D</span>
            <span className="ch-cards-stat-value" style={{ color: changeColor(c.chg30d) }}>{formatChange(c.chg30d)}</span>
          </div>
          <div className="ch-cards-stat">
            <span className="ch-cards-stat-label">Cards</span>
            <span className="ch-cards-stat-value">{c.cardCount.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div className="ch-showcase-header">
        <div>
          <div className="section-title">Top {Math.min(10, c.topCards.length)} Cards <span>— {c.name}</span></div>
          <div className="section-sub">Highest-value cards across all sets</div>
        </div>
        <Link href={gamePath(gameRouteSlug, "/markets")} className="section-action">View all in markets &rarr;</Link>
      </div>
      <div className="ch-showcase-grid">
        {c.topCards.slice(0, 10).map((card, index) => (
          <CharacterTopCard
            key={`${card.cardImageId ?? card.name}-${index}`}
            card={card}
            rank={index + 1}
            gameRouteSlug={gameRouteSlug}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Main Page (client shell — data arrives server-loaded via props) ── */

const INITIAL_CHARACTER_COUNT = 20;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [visibleAllCount, setVisibleAllCount] = useState(ALL_CHARACTER_BATCH_SIZE);
  const [detailsBySlug, setDetailsBySlug] = useState<Record<string, CharacterData>>({});
  const detailRequests = useRef(new Set<string>());
  const overviewRequested = useRef(false);
  const searchRequestId = useRef(0);

  const activePool = search.trim() && searchResults.length > 0 ? searchResults : availableCharacters;
  const baseCharacter = activePool.find((x) => x.slug === activeChar)
    || availableCharacters.find((x) => x.slug === activeChar)
    || activePool[0]
    || availableCharacters[0];
  const c = baseCharacter && detailsBySlug[baseCharacter.slug]
    ? { ...baseCharacter, ...detailsBySlug[baseCharacter.slug] }
    : baseCharacter;
  const hasCharacters = availableCharacters.length > 0;

  useEffect(() => {
    if (!modalOpen || !baseCharacter || detailsBySlug[baseCharacter.slug]) return;
    const expectedTopCards = Math.min(10, baseCharacter.cardCount);
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
  }, [baseCharacter, detailsBySlug, gameRouteSlug, modalOpen]);

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

  const updateCharacterUrl = useCallback((slug: string | null, mode: "push" | "replace") => {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("character", slug);
    else url.searchParams.delete("character");
    const state = slug ? { characterModal: slug } : null;
    if (mode === "push") window.history.pushState(state, "", url);
    else window.history.replaceState(state, "", url);
  }, []);

  const openCharacter = useCallback((slug: string) => {
    setActiveChar(slug);
    setModalOpen(true);
    updateCharacterUrl(slug, "push");
  }, [updateCharacterUrl]);

  const switchCharacter = useCallback((slug: string) => {
    setActiveChar(slug);
    updateCharacterUrl(slug, "replace");
  }, [updateCharacterUrl]);

  const closeCharacter = useCallback(() => {
    setModalOpen(false);
    if (window.history.state?.characterModal) window.history.back();
    else updateCharacterUrl(null, "replace");
  }, [updateCharacterUrl]);

  const toggleAllCharacters = useCallback(() => {
    if (showAll) {
      setShowAll(false);
      setVisibleAllCount(ALL_CHARACTER_BATCH_SIZE);
      return;
    }
    setVisibleAllCount(ALL_CHARACTER_BATCH_SIZE);
    setShowAll(true);
    ensureFullOverview();
  }, [ensureFullOverview, showAll]);

  useEffect(() => {
    const syncModalWithUrl = () => {
      const slug = new URLSearchParams(window.location.search).get("character");
      if (!slug) {
        setModalOpen(false);
        return;
      }
      const exists = availableCharacters.some((character) => character.slug === slug)
        || searchResults.some((character) => character.slug === slug);
      if (exists) {
        setActiveChar(slug);
        setModalOpen(true);
      }
    };

    syncModalWithUrl();
    window.addEventListener("popstate", syncModalWithUrl);
    return () => window.removeEventListener("popstate", syncModalWithUrl);
  }, [availableCharacters, searchResults]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCharacter();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeCharacter, modalOpen]);

  const rankedCharacters = search.trim() ? searchResults : availableCharacters;
  const displayedCharacters = rankedCharacters.slice(
    0,
    search.trim() || showAll ? visibleAllCount : INITIAL_CHARACTER_COUNT,
  );
  const modalPool = search.trim() && searchResults.length > 0 ? searchResults : availableCharacters;
  const modalIndex = c ? modalPool.findIndex((character) => character.slug === c.slug) : -1;
  const previousCharacter = modalIndex > 0 ? modalPool[modalIndex - 1] : null;
  const nextCharacter = modalIndex >= 0 && modalIndex < modalPool.length - 1 ? modalPool[modalIndex + 1] : null;


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
            onSelect={openCharacter}
            onViewAll={toggleAllCharacters}
            viewAllLabel={showAll ? "Show Top 20" : "View All Characters"}
          />

          {/* Character ranking cards */}
          <div className="ch-rank-row">
            {displayedCharacters.map((ch, i) => (
              <RankCard key={ch.slug} c={ch} rank={i + 1} active={modalOpen && activeChar === ch.slug} onClick={() => openCharacter(ch.slug)} />
            ))}
          </div>

          {displayedCharacters.length === 0 && (
            <div className="ch-empty-results">No characters found.</div>
          )}

          {showAll && visibleAllCount < rankedCharacters.length && (
            <div className="ch-see-all-wrap">
              <button
                className="ch-see-all-btn"
                onClick={() => setVisibleAllCount((count) => count + ALL_CHARACTER_BATCH_SIZE)}
              >
                Load More Characters
              </button>
            </div>
          )}

          {modalOpen && c && (
            <div
              className="ch-character-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeCharacter();
              }}
            >
              <section
                className="ch-character-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="character-modal-title"
              >
                <div className="ch-character-modal-toolbar">
                  <div>
                    <span className="ch-character-modal-kicker">Character details</span>
                    <h2 id="character-modal-title">{c.name}</h2>
                  </div>
                  <div className="ch-character-modal-actions">
                    <button
                      type="button"
                      className="ch-modal-nav-btn"
                      disabled={!previousCharacter}
                      onClick={() => previousCharacter && switchCharacter(previousCharacter.slug)}
                    >
                      <span aria-hidden="true">←</span> Previous
                    </button>
                    <button
                      type="button"
                      className="ch-modal-nav-btn"
                      disabled={!nextCharacter}
                      onClick={() => nextCharacter && switchCharacter(nextCharacter.slug)}
                    >
                      Next <span aria-hidden="true">→</span>
                    </button>
                    <button type="button" className="ch-modal-close" onClick={closeCharacter} aria-label="Close character details" autoFocus>×</button>
                  </div>
                </div>
                <div className="ch-character-modal-body">
                  <CharacterCards c={c} gameRouteSlug={gameRouteSlug} />
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
