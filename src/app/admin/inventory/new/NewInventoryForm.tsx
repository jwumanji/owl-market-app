"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PUBLIC_GAME_DB_SLUG } from "@/lib/game-scope";
import { GRADED_RATINGS, type CatalogMatchStatus, type GradedRating, type InventoryStatus, type InventoryType } from "@/lib/inventory-options";

type PurchasedFrom = "facebook" | "ebay" | "instagram" | "direct_person" | "event";

type CardSearchResult = {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  sets: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
  source?: "catalog" | "custom";
};

const CONDITIONS: { value: InventoryType; label: string }[] = [
  { value: "raw", label: "Raw" },
  { value: "damaged", label: "Damaged" },
  { value: "graded", label: "Graded" },
  { value: "sealed", label: "Sealed" },
];

const STATUSES: { value: InventoryStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "grading", label: "Grading" },
  { value: "sale", label: "For Sale" },
  { value: "ship", label: "Need Shipping" },
  { value: "sold", label: "Sold" },
];

const PURCHASED_FROM_OPTIONS: { value: PurchasedFrom; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "ebay", label: "Ebay" },
  { value: "instagram", label: "Instagram" },
  { value: "direct_person", label: "Direct Person" },
  { value: "event", label: "Event" },
];

function setCode(card: CardSearchResult) {
  const set = Array.isArray(card.sets) ? card.sets[0] : card.sets;
  return set?.code ?? null;
}

function CardThumbnail({
  card,
  className,
  placeholderClassName,
}: {
  card: CardSearchResult;
  className: string;
  placeholderClassName: string;
}) {
  const imageUrl = card.image_url_small ?? card.image_url;

  if (!imageUrl) {
    return (
      <div className={placeholderClassName}>
        BOX
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={card.name ?? "Card thumbnail"}
      className={className}
    />
  );
}

function CardMetadata({ card, inverted = false }: { card: CardSearchResult; inverted?: boolean }) {
  return (
    <div className={`mt-1 flex flex-wrap gap-2 font-mono text-xs ${inverted ? "text-bg/80" : "text-ink-2"}`}>
      {setCode(card) && <span>{setCode(card)}</span>}
      {card.card_number && <span>{card.card_number}</span>}
      {card.rarity && <span>{card.rarity}</span>}
      {card.source === "custom" && (
        <span className="rounded border border-gain-2/40 bg-[#DCF1E6] px-1.5 py-0.5 text-gain-2">
          Private
        </span>
      )}
    </div>
  );
}

function todayDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export default function NewInventoryForm({
  gameSlug = DEFAULT_PUBLIC_GAME_DB_SLUG,
}: {
  gameSlug?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardSearchResult | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [notInCatalog, setNotInCatalog] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [manualSet, setManualSet] = useState("");
  const [condition, setCondition] = useState<InventoryType>("raw");
  const [status, setStatus] = useState<InventoryStatus>("new");
  const [nickname, setNickname] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [gradedRating, setGradedRating] = useState<GradedRating | "">("");
  const [certificationNumber, setCertificationNumber] = useState("");
  const [frontScan, setFrontScan] = useState<File | null>(null);
  const [backScan, setBackScan] = useState<File | null>(null);
  const [acquiredAt, setAcquiredAt] = useState(() => todayDateString());
  const [costBasis, setCostBasis] = useState("");
  const [purchasedFrom, setPurchasedFrom] = useState<PurchasedFrom | "">("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => (selectedCard || ((manualMode || notInCatalog) && manualName.trim())) && quantity >= 1 && !saving,
    [selectedCard, manualMode, notInCatalog, manualName, quantity, saving]
  );
  const showCustomPhotoUpload = condition === "graded" || ((manualMode || notInCatalog) && !selectedCard);

  async function searchCards(value: string) {
    setQuery(value);
    setSelectedCard(null);
    if (!notInCatalog) {
      setManualMode(false);
    }

    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({ q: value, game: gameSlug });
    const res = await fetch(`/api/admin/cards/search?${params}`);
    setLoading(false);

    if (!res.ok) {
      setError("Could not search cards.");
      return;
    }

    setResults(await res.json());
  }

  async function submit() {
    if (!selectedCard && (!(manualMode || notInCatalog) || !manualName.trim())) return;

    setSaving(true);
    setError(null);

    const selectedCustomCard = selectedCard?.source === "custom";
    const catalogMatchStatus: CatalogMatchStatus = selectedCard
      ? selectedCustomCard
        ? "custom_verified"
        : "matched"
      : notInCatalog
        ? "custom_verified"
        : "needs_match";

    const payload = {
      card_id: selectedCard && !selectedCustomCard ? selectedCard.id : "",
      custom_card_id: selectedCustomCard ? selectedCard.id : "",
      manual_card_name: manualMode ? manualName : "",
      manual_card_number: manualMode ? manualNumber : "",
      manual_set_code: manualMode ? manualSet : "",
      catalog_match_status: catalogMatchStatus,
      item_nickname: nickname,
      inventory_type: condition,
      status,
      quantity: String(quantity),
      graded_rating: condition === "graded" ? gradedRating : "",
      certification_number: condition === "graded" ? certificationNumber : "",
      acquired_at: acquiredAt || "",
      cost_basis: costBasis,
      purchased_from: purchasedFrom,
      notes,
      game: gameSlug,
    };

    const hasScanUploads = Boolean(frontScan || backScan);
    const res = hasScanUploads
      ? await fetch("/api/admin/inventory", {
          method: "POST",
          body: (() => {
            const formData = new FormData();
            Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
            if (frontScan) formData.append("custom_image_front", frontScan);
            if (backScan) formData.append("custom_image_back", backScan);
            return formData;
          })(),
        })
      : await fetch("/api/admin/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not add inventory.");
      return;
    }

    router.push(`/admin/inventory?game=${encodeURIComponent(gameSlug)}`);
  }

  const selectedCardId = selectedCard?.id ?? null;

  return (
    <div className="space-y-6">
      <div className="admin-card p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="inline-flex h-6.5 w-6.5 items-center justify-center rounded-c-pill border-[1.5px] border-ink font-mono-2 text-xs font-bold text-ink" style={{ width: 26, height: 26 }}>
            1
          </span>
          <span className="font-grotesk text-xl font-bold tracking-[-0.01em] text-ink">Find the card</span>
        </div>
        <label className="admin-field-label">Search Card</label>
        <input
          value={query}
          onChange={(event) => searchCards(event.target.value)}
          placeholder="Search by card name or card number"
          className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-4 py-3 text-base text-ink outline-none focus:border-coral"
        />

        {selectedCard ? (
          <div className="mt-4 flex items-center gap-3.5 rounded-c-md border-[1.5px] border-gain-2 bg-[#DCF1E6] px-4 py-3">
            <CardThumbnail
              card={selectedCard}
              className="h-14 w-10 shrink-0 rounded-[5px] border-[1.5px] border-ink object-cover"
              placeholderClassName="flex h-14 w-10 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-ink bg-bg-3 font-mono text-xs text-ink-2"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-grotesk text-base font-bold text-ink">
                {selectedCard.name ?? "Unknown Card"}
              </div>
              <CardMetadata card={selectedCard} />
            </div>
            <span className="shrink-0 font-mono-2 text-[11px] font-bold uppercase tracking-wider text-gain-2">
              Selected
            </span>
          </div>
        ) : (
          <div className="mt-4 max-h-[560px] overflow-y-auto rounded-lg border border-ink">
            {loading && <div className="p-4 text-sm text-ink-2">Searching...</div>}
            {!loading && results.length === 0 && (
              <div className="p-4 text-sm text-ink-2">Search for a card to add inventory.</div>
            )}
            {results.map((card) => {
              const isSelected = selectedCardId === card.id;

              return (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedCard(card);
                    setManualMode(false);
                    setNotInCatalog(false);
                    setFrontScan(null);
                    setBackScan(null);
                    setQuery(card.name ?? "");
                  }}
                  className={`flex w-full items-center gap-4 border-b border-l-4 border-b-bg-3 p-3 text-left transition-colors last:border-b-0 ${
                    isSelected
                      ? "border-l-ink bg-select hover:bg-[#1B3F8F]"
                      : "border-l-transparent bg-bg-2 hover:bg-bg-3"
                  }`}
                >
                  <CardThumbnail
                    card={card}
                    className={`h-20 w-14 shrink-0 rounded object-cover ${isSelected ? "ring-2 ring-bg" : ""}`}
                    placeholderClassName="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-bg-3 font-mono text-xs text-ink-2"
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-base font-bold ${isSelected ? "text-bg" : "text-ink"}`}>
                      {card.name ?? "Unknown Card"}
                    </div>
                    <CardMetadata card={card} inverted={isSelected} />
                  </div>
                  {isSelected && (
                    <span className="shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-bg">
                      Selected ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 rounded-lg border border-coral/40 bg-bg-3 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-mono text-sm font-bold uppercase tracking-wider text-coral">
                Can’t find the card?
              </div>
              <div className="mt-1 text-sm text-ink-2">
                Add it to your private card list now, then match it to the OWL card database later if needed.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setManualMode(true);
                setSelectedCard(null);
                setManualName(query);
              }}
              className="whitespace-nowrap rounded-md border border-coral bg-bg-3 px-4 py-2 font-mono text-sm font-bold uppercase tracking-wider text-coral hover:bg-bg-3"
            >
              Add Card to Catalog
            </button>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-c-md border-[1.5px] border-ink-3 bg-bg-2 p-4 transition-colors hover:border-ink">
          <input
            type="checkbox"
            checked={notInCatalog}
            onChange={(event) => {
              const checked = event.target.checked;
              setNotInCatalog(checked);
              if (checked) {
                setSelectedCard(null);
                setManualMode(true);
                setManualName((current) => current || query);
              }
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-coral"
          />
          <span className="min-w-0">
            <span className="block font-mono text-sm font-bold uppercase tracking-wider text-ink">
              Not in catalog
            </span>
            <span className="mt-1 block text-sm text-ink-2">
              This is a real item and does not need catalog matching.
            </span>
          </span>
        </label>
      </div>

      <div className="admin-card p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center rounded-c-pill border-[1.5px] border-ink font-mono-2 text-xs font-bold text-ink" style={{ width: 26, height: 26 }}>
            2
          </span>
          <h2 className="font-grotesk text-xl font-bold tracking-[-0.01em] text-ink">Inventory Details</h2>
        </div>
        {selectedCard && (
          <div className="admin-card-inset mt-4 p-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_112px] sm:items-start">
              <div className="min-w-0">
                <div className="admin-field-label text-coral">Selected Card</div>
                <div className="mt-2 font-grotesk text-2xl font-bold leading-tight text-ink">
                  {selectedCard.name ?? "Unknown Card"}
                </div>
                <CardMetadata card={selectedCard} />
              </div>
              <CardThumbnail
                card={selectedCard}
                className="h-40 w-28 rounded-md border-[1.5px] border-ink object-cover sm:justify-self-end"
                placeholderClassName="flex h-40 w-28 items-center justify-center rounded-md border-[1.5px] border-ink bg-bg-2 font-mono text-xs text-ink-2 sm:justify-self-end"
              />
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {manualMode && (
            <div className="rounded-lg border border-coral/40 bg-bg-3 p-4 lg:col-span-2">
              <div className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-coral">
                {notInCatalog ? "Private Item Entry" : "Add Card to Catalog"}
              </div>
              <label className="block">
                <span className="admin-field-label">
                  {notInCatalog ? "Item Name" : "Card Name"}
                </span>
                <input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder={notInCatalog ? "Enter item name" : "Enter card name"}
                  className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
                />
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="admin-field-label">Set Code</span>
                  <input
                    value={manualSet}
                    onChange={(event) => setManualSet(event.target.value)}
                    placeholder="Optional"
                    className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
                  />
                </label>
                <label className="block">
                  <span className="admin-field-label">Card Number</span>
                  <input
                    value={manualNumber}
                    onChange={(event) => setManualNumber(event.target.value)}
                    placeholder="Optional"
                    className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
                  />
                </label>
              </div>
            </div>
          )}

          <label className="block">
            <span className="admin-field-label">Condition</span>
            <select
              value={condition}
              onChange={(event) => {
                const nextCondition = event.target.value as InventoryType;
                setCondition(nextCondition);
                if (nextCondition !== "graded") {
                  setGradedRating("");
                  setCertificationNumber("");
                }
              }}
              className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
            >
              {CONDITIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="admin-field-label">Item Nickname</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Optional searchable nickname"
              className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
            />
          </label>

          {condition === "graded" && (
            <div className="rounded-c-md border-[1.5px] border-dashed border-gold bg-[#FFFBF2] p-4 lg:col-span-2">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-grotesk text-sm font-bold text-ink">Grading info</span>
                <span className="rounded border-[1.2px] border-gold bg-[#FBF0DA] px-1.5 py-0.5 font-mono-2 text-[10px] font-semibold uppercase tracking-wider text-gold">
                  shows when condition = graded
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="admin-field-label">Graded Rating</span>
                  <select
                    value={gradedRating}
                    onChange={(event) => setGradedRating(event.target.value as GradedRating | "")}
                    className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
                  >
                    <option value="">Select rating</option>
                    {GRADED_RATINGS.map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="admin-field-label">Certification Number</span>
                  <input
                    value={certificationNumber}
                    onChange={(event) => setCertificationNumber(event.target.value)}
                    placeholder="PSA cert number"
                    className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
                  />
                </label>
              </div>
            </div>
          )}

          <label className="block">
            <span className="admin-field-label">Starting Stage</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as InventoryStatus)}
              className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="admin-field-label">Quantity</span>
            <input
              type="number"
              min={1}
              max={100}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
            />
          </label>

          <label className="block">
            <span className="admin-field-label">Acquired Date</span>
            <input
              type="date"
              value={acquiredAt}
              onChange={(event) => setAcquiredAt(event.target.value)}
              className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
            />
          </label>

          <label className="block">
            <span className="admin-field-label">Cost Basis</span>
            <input
              inputMode="decimal"
              value={costBasis}
              onChange={(event) => setCostBasis(event.target.value)}
              placeholder="Optional"
              className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
            />
          </label>

          <label className="block">
            <span className="admin-field-label">Purchased From</span>
            <select
              value={purchasedFrom}
              onChange={(event) => setPurchasedFrom(event.target.value as PurchasedFrom | "")}
              className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
            >
              <option value="">Select origin</option>
              {PURCHASED_FROM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block lg:col-span-2">
            <span className="admin-field-label">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Optional"
              className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-3 text-ink outline-none focus:border-coral"
            />
          </label>

          {showCustomPhotoUpload && (
            <div className="rounded-lg border border-ink bg-bg-2 p-4 lg:col-span-2">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-ink-2">
                {condition === "graded" ? "Scan Images" : "Custom Photos"}
              </div>
              <p className="mt-2 text-sm text-ink-2">
                {condition === "graded"
                  ? "Upload front and back slab scans for this graded item."
                  : "Upload the first photo as the front of the card so custom items can be indexed."}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="admin-field-label">
                    {condition === "graded" ? "Front Scan" : "First Photo / Front"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => setFrontScan(event.target.files?.[0] ?? null)}
                    className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-2.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-ink file:px-3 file:py-2 file:font-mono file:text-xs file:font-bold file:uppercase file:text-bg"
                  />
                  {frontScan && (
                    <span className="mt-2 block truncate font-mono text-xs font-semibold text-coral">
                      {frontScan.name}
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="admin-field-label">
                    {condition === "graded" ? "Back Scan" : "Back Photo"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => setBackScan(event.target.files?.[0] ?? null)}
                    className="mt-2 w-full rounded-md border border-ink bg-bg-2 px-3 py-2.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-ink file:px-3 file:py-2 file:font-mono file:text-xs file:font-bold file:uppercase file:text-bg"
                  />
                  {backScan && (
                    <span className="mt-2 block truncate font-mono text-xs font-semibold text-coral">
                      {backScan.name}
                    </span>
                  )}
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-loss-2/40 bg-[#FBE3E3] p-3 text-sm text-ink lg:col-span-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 lg:col-span-2">
            <a
              href={`/admin/inventory?game=${encodeURIComponent(gameSlug)}`}
              className="admin-btn admin-btn-ghost"
            >
              Cancel
            </a>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className="admin-btn admin-btn-primary flex-1 justify-center disabled:cursor-not-allowed disabled:border-bg-3 disabled:bg-bg-3 disabled:text-ink-3"
            >
              {saving ? "Adding..." : "Add Inventory"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
