"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InventoryType = "raw" | "damaged" | "graded" | "sealed";
type InventoryStatus = "new" | "grading" | "sale" | "ship" | "sold";
type GradedRating = "TAG 10" | "PSA 10" | "PSA 9" | "BGS 10" | "BGS 9.5";
type PurchasedFrom = "facebook" | "ebay" | "instagram" | "direct_person" | "event";

type CardSearchResult = {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  sets: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
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

const GRADED_RATINGS: GradedRating[] = ["TAG 10", "PSA 10", "PSA 9", "BGS 10", "BGS 9.5"];
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

function todayDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export default function NewInventoryForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardSearchResult | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [manualSet, setManualSet] = useState("");
  const [condition, setCondition] = useState<InventoryType>("raw");
  const [status, setStatus] = useState<InventoryStatus>("new");
  const [nickname, setNickname] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [gradedRating, setGradedRating] = useState<GradedRating | "">("");
  const [acquiredAt, setAcquiredAt] = useState(() => todayDateString());
  const [costBasis, setCostBasis] = useState("");
  const [purchasedFrom, setPurchasedFrom] = useState<PurchasedFrom | "">("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => (selectedCard || (manualMode && manualName.trim())) && quantity >= 1 && !saving,
    [selectedCard, manualMode, manualName, quantity, saving]
  );

  async function searchCards(value: string) {
    setQuery(value);
    setSelectedCard(null);
    setManualMode(false);

    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/admin/cards/search?q=${encodeURIComponent(value)}`);
    setLoading(false);

    if (!res.ok) {
      setError("Could not search cards.");
      return;
    }

    setResults(await res.json());
  }

  async function submit() {
    if (!selectedCard && (!manualMode || !manualName.trim())) return;

    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        card_id: selectedCard?.id ?? null,
        manual_card_name: manualMode ? manualName : null,
        manual_card_number: manualMode ? manualNumber : null,
        manual_set_code: manualMode ? manualSet : null,
        item_nickname: nickname,
        inventory_type: condition,
        status,
        quantity,
        graded_rating: condition === "graded" ? gradedRating || null : null,
        acquired_at: acquiredAt || null,
        cost_basis: costBasis || null,
        purchased_from: purchasedFrom || null,
        notes,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not add inventory.");
      return;
    }

    router.push("/admin/inventory");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-lg border border-border bg-surface p-5">
        <label className="font-mono text-sm font-semibold uppercase tracking-wider text-text">Search Card</label>
        <input
          value={query}
          onChange={(event) => searchCards(event.target.value)}
          placeholder="Search by card name or card number"
          className="mt-3 w-full rounded-md border border-border bg-deep px-4 py-3 text-base text-text outline-none focus:border-owl"
        />

        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          {loading && <div className="p-4 text-sm text-text-2">Searching...</div>}
          {!loading && results.length === 0 && (
            <div className="p-4 text-sm text-text-2">Search for a card to add inventory.</div>
          )}
          {results.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                setSelectedCard(card);
                setQuery(card.name ?? "");
              }}
              className={`flex w-full items-center gap-4 border-b border-border p-3 text-left transition-colors last:border-b-0 hover:bg-surf2 ${
                selectedCard?.id === card.id ? "bg-owl/10" : "bg-surface"
              }`}
            >
              {card.image_url || card.image_url_small ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.image_url_small ?? card.image_url ?? ""}
                  alt=""
                  className="h-20 w-14 rounded object-cover"
                />
              ) : (
                <div className="flex h-20 w-14 items-center justify-center rounded bg-surf3 font-mono text-xs text-text-2">
                  BOX
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-text">{card.name ?? "Unknown Card"}</div>
                <div className="mt-1 flex gap-2 font-mono text-xs text-text-2">
                  {setCode(card) && <span>{setCode(card)}</span>}
                  {card.card_number && <span>{card.card_number}</span>}
                  {card.rarity && <span>{card.rarity}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-owl/30 bg-owl/10 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-mono text-sm font-bold uppercase tracking-wider text-owl">
                Can’t find the card?
              </div>
              <div className="mt-1 text-sm text-text-2">
                Add it manually now and match it to the OWL card database later.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setManualMode(true);
                setSelectedCard(null);
                setManualName(query);
              }}
              className="rounded-md border border-owl bg-owl/10 px-4 py-2 font-mono text-sm font-bold uppercase tracking-wider text-owl hover:bg-owl/15"
            >
              Add Manually
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-xl font-bold text-text">Inventory Details</h2>

        <div className="mt-5 space-y-4">
          {manualMode && (
            <div className="rounded-lg border border-owl/30 bg-owl/10 p-4">
              <div className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-owl">
                Manual Card Entry
              </div>
              <label className="block">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Card Name</span>
                <input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Enter card name"
                  className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
                />
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Set Code</span>
                  <input
                    value={manualSet}
                    onChange={(event) => setManualSet(event.target.value)}
                    placeholder="Optional"
                    className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Card Number</span>
                  <input
                    value={manualNumber}
                    onChange={(event) => setManualNumber(event.target.value)}
                    placeholder="Optional"
                    className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
                  />
                </label>
              </div>
            </div>
          )}

          <label className="block">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Condition</span>
            <select
              value={condition}
              onChange={(event) => setCondition(event.target.value as InventoryType)}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            >
              {CONDITIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Item Nickname</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Optional searchable nickname"
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>

          {condition === "graded" && (
            <label className="block">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Graded Rating</span>
              <select
                value={gradedRating}
                onChange={(event) => setGradedRating(event.target.value as GradedRating | "")}
                className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
              >
                <option value="">Select rating</option>
                {GRADED_RATINGS.map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Starting Stage</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as InventoryStatus)}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Quantity</span>
            <input
              type="number"
              min={1}
              max={100}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>

          <label className="block">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Acquired Date</span>
            <input
              type="date"
              value={acquiredAt}
              onChange={(event) => setAcquiredAt(event.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>

          <label className="block">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Cost Basis</span>
            <input
              inputMode="decimal"
              value={costBasis}
              onChange={(event) => setCostBasis(event.target.value)}
              placeholder="Optional"
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>

          <label className="block">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Purchased From</span>
            <select
              value={purchasedFrom}
              onChange={(event) => setPurchasedFrom(event.target.value as PurchasedFrom | "")}
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            >
              <option value="">Select origin</option>
              {PURCHASED_FROM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-2">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Optional"
              className="mt-2 w-full rounded-md border border-border bg-deep px-3 py-3 text-text outline-none focus:border-owl"
            />
          </label>

          {error && <div className="rounded-md border border-loss/30 bg-loss/10 p-3 text-sm text-text">{error}</div>}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="w-full rounded-md bg-owl px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light disabled:cursor-not-allowed disabled:bg-surf3 disabled:text-text-3"
          >
            {saving ? "Adding..." : "Add Inventory"}
          </button>
        </div>
      </div>
    </div>
  );
}
