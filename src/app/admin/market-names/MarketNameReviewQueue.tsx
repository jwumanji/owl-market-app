"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import MarketCardImage from "@/components/market/MarketCardImage";
import type { MarketNameSuggestion } from "@/lib/card-market-name-admin";
import { formatPrice } from "@/lib/utils";

const CONFIDENCE_LABELS = {
  high: "High confidence",
  medium_high: "Medium-high",
  medium: "Medium",
  research_required: "Research required",
} as const;

function sourceLabel(sourceType: string) {
  if (sourceType === "tcgplayer_product") return "TCGplayer product";
  if (sourceType === "tcgplayer_editorial") return "TCGplayer editorial";
  return sourceType.replace(/_/g, " ");
}
function ReviewCard({ suggestion }: { suggestion: MarketNameSuggestion }) {
  const router = useRouter();
  const [marketName, setMarketName] = useState(
    suggestion.status === "approved" && suggestion.card.market_name
      ? suggestion.card.market_name
      : suggestion.proposed_market_name,
  );
  const [aliases, setAliases] = useState(
    (suggestion.status === "approved" && suggestion.card.aliases.length > 0
      ? suggestion.card.aliases
      : suggestion.proposed_aliases
    ).join("\n"),
  );
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/market-names/${suggestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          marketName,
          aliases,
          note: action === "reject" ? "Rejected from the admin curation queue." : undefined,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "The review could not be saved.");
      router.refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The review could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  const imageUrl = suggestion.card.image_url_preview ?? suggestion.card.image_url_small ?? suggestion.card.image_url;

  return (
    <article className="market-name-review-card">
      <div className="market-name-review-identity">
        <div className="market-name-review-image">
          <MarketCardImage
            alt={suggestion.card.official_name}
            className="h-full w-full object-cover"
            fallbackTimeoutMs={0}
            fetchPriority="low"
            height={252}
            imageUrl={imageUrl}
            imageUrlPreview={suggestion.card.image_url_preview}
            imageUrlSmall={suggestion.card.image_url_small}
            loading="lazy"
            sourceSize="display"
            width={180}
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className={`market-name-confidence is-${suggestion.confidence}`}>
              {CONFIDENCE_LABELS[suggestion.confidence]}
            </span>
            <span className={`market-name-status is-${suggestion.status}`}>{suggestion.status}</span>
          </div>
          <h2 className="mt-4 font-grotesk text-xl font-bold leading-tight text-ink">
            {suggestion.card.official_name}
          </h2>
          <div className="mt-2 font-mono-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
            {[suggestion.card.set_code, suggestion.card.card_number, suggestion.card.variant_label]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-4 font-mono-2 text-2xl font-semibold text-coral-text">
            {formatPrice(suggestion.card.market_avg)}
          </div>
          <div className="mt-1 font-mono-2 text-[10px] uppercase tracking-[0.1em] text-ink-3">
            Current market value
          </div>
        </div>
      </div>

      <div className="market-name-review-editor">
        <label>
          <span className="admin-field-label">Market Name</span>
          <input
            className="admin-input mt-2 w-full"
            maxLength={120}
            value={marketName}
            onChange={(event) => setMarketName(event.target.value)}
          />
        </label>
        <label className="mt-4 block">
          <span className="admin-field-label">Search aliases · one per line</span>
          <textarea
            className="market-name-alias-input mt-2"
            rows={6}
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
          />
        </label>
        {suggestion.research_note && (
          <p className="mt-4 rounded-c-sm bg-bg-3 p-3 font-grotesk text-xs leading-relaxed text-ink-2">
            {suggestion.research_note}
          </p>
        )}
        {suggestion.rejection_note && (
          <p className="mt-3 font-mono-2 text-[11px] text-coral-text">Previous decision: {suggestion.rejection_note}</p>
        )}
      </div>

      <div className="market-name-review-evidence">
        <div className="admin-field-label">Evidence</div>
        {suggestion.evidence.length > 0 ? (
          <div className="mt-3 space-y-3">
            {suggestion.evidence.map((source) => (
              <a
                key={source.id}
                className="market-name-source"
                href={source.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{sourceLabel(source.source_type)}</span>
                <strong>{source.source_title ?? source.source_name}</strong>
                {source.evidence_note && <small>{source.evidence_note}</small>}
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-c-sm border border-dashed border-ink/30 p-4 font-grotesk text-xs text-ink-2">
            No linked source yet. Research this candidate before approval.
          </div>
        )}

        {error && <div className="mt-4 rounded-c-sm bg-[#FFE2DD] p-3 font-grotesk text-xs text-coral-text">{error}</div>}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={busy != null}
            onClick={() => review("approve")}
          >
            {busy === "approve"
              ? "Saving…"
              : suggestion.status === "approved"
                ? "Save approved name"
                : "Approve for display"}
          </button>
          {suggestion.status !== "approved" && (
            <button
              type="button"
              className="admin-btn admin-btn-danger"
              disabled={busy != null}
              onClick={() => review("reject")}
            >
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function MarketNameReviewQueue({ suggestions }: { suggestions: MarketNameSuggestion[] }) {
  return (
    <div className="market-name-review-list">
      {suggestions.map((suggestion) => <ReviewCard key={suggestion.id} suggestion={suggestion} />)}
    </div>
  );
}
