"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  computeMeasurements,
  psaCeilingBack,
  psaCeilingFront,
  type PsaGrade,
} from "@/lib/centering-math";
import { AxisRatioValue } from "./AxisRatioCard";
import {
  axisTone,
  bareGradeLabel,
  gradeTierAccentStyleForGrade,
  gradeTierColorForGrade,
  graderResultsFromFaces,
  TONE_TEXT_CLASSES,
  type GraderResult,
} from "./grading";
import type { LensFace, LensFaceState, LensMeasuredFace } from "./lens-types";

type ResultsPanelProps = {
  faces: Partial<Record<LensFace, LensFaceState>>;
  activeFace?: LensFace;
  cardIdentity?: string | null;
  cardSessionId?: string | null;
  onActiveFaceChange?: (face: LensFace) => void;
  onCardIdentityChange?: (value: string) => void;
  onDownloadReport: () => void;
  onMeasureAnother: () => void;
};

function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function measuredFaces(faces: Partial<Record<LensFace, LensFaceState>>) {
  return (["front", "back"] as LensFace[])
    .map((face) => faces[face])
    .filter((face): face is LensFaceState => Boolean(face))
    .map((face) => ({
      ...face,
      measurement: computeMeasurements(face.overlay),
    }));
}

function combinedPsaResult(faces: LensMeasuredFace[]) {
  const front = faces.find((face) => face.face === "front") ?? faces[0];
  const back = front.face === "front" ? faces.find((face) => face.face === "back") ?? null : null;
  const graderResults = graderResultsFromFaces({
    front: { worstMax: front.measurement.worstAxisMaxPct },
    back: back ? { worstMax: back.measurement.worstAxisMaxPct } : null,
  });
  const psa = graderResults[0] as GraderResult<PsaGrade>;
  const worstFace = psa.breakdown.back &&
    psa.ceiling === psa.breakdown.back.ceiling &&
    (psa.breakdown.front.ceiling !== psa.breakdown.back.ceiling ||
      psa.breakdown.back.worstMax > psa.breakdown.front.worstMax)
    ? back ?? front
    : front;

  return {
    psa,
    graderResults,
    front,
    back,
    worstFace,
  };
}

function ActionButtons({
  onDownloadReport,
  onMeasureAnother,
}: {
  onDownloadReport: () => void;
  onMeasureAnother: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={onDownloadReport}
        className="rounded-md border border-owl/40 bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
      >
        Download report
      </button>
      <button
        type="button"
        onClick={onMeasureAnother}
        className="rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:bg-surf2"
      >
        Measure another
      </button>
    </div>
  );
}

export function reportCardNameDisplay(cardIdentity?: string | null) {
  return cardIdentity?.trim() || "Untitled card";
}

export function reportCardNameKeyAction(key: string) {
  if (key === "Enter") return "commit";
  if (key === "Escape") return "cancel";
  return null;
}

export async function saveReportCardIdentity({
  sessionId,
  cardIdentity,
  fetchImpl = fetch,
}: {
  sessionId?: string | null;
  cardIdentity: string;
  fetchImpl?: typeof fetch;
}) {
  if (!sessionId) {
    throw new Error("A saved pre-grade session id is required.");
  }

  const response = await fetchImpl(`/api/centering/session/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card_identity: cardIdentity.trim() || null }),
  });

  if (!response.ok) {
    throw new Error(`Could not rename pre-grade (${response.status}).`);
  }

  return response.json() as Promise<unknown>;
}

function ReportCardName({
  cardIdentity,
  cardSessionId,
  onCardIdentityChange,
}: {
  cardIdentity?: string | null;
  cardSessionId?: string | null;
  onCardIdentityChange?: (value: string) => void;
}) {
  const [localName, setLocalName] = useState(cardIdentity ?? "");
  const [draftName, setDraftName] = useState(cardIdentity ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    setLocalName(cardIdentity ?? "");
    setDraftName(cardIdentity ?? "");
  }, [cardIdentity]);

  async function commitRename() {
    const nextName = draftName.trim();
    const currentName = localName.trim();
    if (nextName === currentName) {
      setDraftName(nextName);
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await saveReportCardIdentity({
        sessionId: cardSessionId,
        cardIdentity: nextName,
      });
      setLocalName(nextName);
      setDraftName(nextName);
      onCardIdentityChange?.(nextName);
      setIsEditing(false);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not rename pre-grade.");
    } finally {
      setIsSaving(false);
    }
  }

  function cancelRename() {
    skipBlurCommit.current = true;
    setDraftName(localName);
    setError(null);
    setIsEditing(false);
  }

  return (
    <div className="mx-auto max-w-3xl text-center" data-report-card-name="true">
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-2">
        Card name
      </div>
      {isEditing ? (
        <input
          autoFocus
          value={draftName}
          disabled={isSaving}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => {
            if (skipBlurCommit.current) {
              skipBlurCommit.current = false;
              return;
            }
            void commitRename();
          }}
          onKeyDown={(event) => {
            const action = reportCardNameKeyAction(event.key);
            if (!action) return;
            event.preventDefault();
            if (action === "commit") {
              void commitRename();
              return;
            }
            cancelRename();
          }}
          aria-label="Card name"
          placeholder="Untitled card"
          className="mt-2 w-full max-w-xl rounded-lg border border-owl/50 bg-deep px-4 py-3 text-center text-3xl font-semibold leading-tight text-text outline-none placeholder:text-text-3 disabled:cursor-wait disabled:opacity-60"
        />
      ) : (
        <div className="mt-2 inline-flex max-w-full items-center justify-center gap-2">
          <span className="truncate text-3xl font-semibold leading-tight text-text">
            {reportCardNameDisplay(localName)}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraftName(localName);
              setIsEditing(true);
            }}
            aria-label="Edit card name"
            data-card-name-edit-button="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-text-2 transition-colors hover:border-border hover:bg-surface hover:text-owl focus-visible:border-owl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-owl/30"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && <div className="mt-2 text-sm text-loss">{error}</div>}
    </div>
  );
}

function ReportGraderRow({ results }: { results: GraderResult[] }) {
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-3">
      {results.map((result) => (
        <div
          key={result.name}
          className="rounded-md border px-4 py-3 text-center"
          style={gradeTierAccentStyleForGrade(result.ceiling)}
        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-2">
            {result.name}
          </div>
          <div className="mt-1.5 font-mono text-3xl font-bold leading-none">
            {result.value}
          </div>
          {result.subLabel && (
            <div className="mt-1.5 font-mono text-[11px] leading-tight text-text-2">
              {result.subLabel}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CombinedHero({
  combined,
}: {
  combined: ReturnType<typeof combinedPsaResult>;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center" data-report-combined-hero="true">
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-2">
        Combined ceiling
      </div>
      <div
        className="mt-2 font-mono text-7xl font-bold leading-none sm:text-8xl"
        style={{ color: gradeTierColorForGrade(combined.psa.ceiling) }}
      >
        {bareGradeLabel(combined.psa.ceiling)}
      </div>
      <div className="mt-2 font-mono text-[11px] text-text-2">
        {combined.back ? "worse of front · back" : "front only (back not measured)"}
      </div>
      <ReportGraderRow results={combined.graderResults} />
    </div>
  );
}

function FaceAxisPanel({
  label,
  firstLabel,
  firstValue,
  secondLabel,
  secondValue,
  tone,
}: {
  label: "L / R" | "T / B";
  firstLabel: "L" | "T";
  firstValue: number;
  secondLabel: "R" | "B";
  secondValue: number;
  tone: ReturnType<typeof axisTone>;
}) {
  return (
    <div className="rounded-md border border-border bg-deep p-3">
      <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-text-2">
        {label}
      </div>
      <AxisRatioValue
        firstLabel={firstLabel}
        firstValue={firstValue}
        secondLabel={secondLabel}
        secondValue={secondValue}
        tone={tone}
        size="md"
      />
    </div>
  );
}

function ReportFaceCard({
  face,
  measurement,
  imageUrl,
  isWorst,
  isActive,
  onSelect,
}: LensMeasuredFace & {
  isWorst: boolean;
  isActive: boolean;
  onSelect?: () => void;
}) {
  const faceCeiling = face === "back"
    ? psaCeilingBack(measurement.worstAxisMaxPct)
    : psaCeilingFront(measurement.worstAxisMaxPct);
  const leftRightTone = axisTone(measurement.leftPct, measurement.rightPct);
  const topBottomTone = axisTone(measurement.topPct, measurement.bottomPct);
  const worstAxis = measurement.worstAxis === "leftRight" ? "L/R" : "T/B";
  const worstAxisTone = measurement.worstAxis === "leftRight" ? leftRightTone : topBottomTone;
  const interactive = Boolean(onSelect);
  const cardClassName = [
    "rounded-lg border bg-surface p-4",
    isActive ? "border-owl" : "border-border",
    interactive
      ? "cursor-pointer outline-none transition-colors hover:border-border-2 focus-visible:border-owl focus-visible:ring-2 focus-visible:ring-owl/30"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onSelect();
  }

  return (
    <article
      className={cardClassName}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Switch to ${face} face` : undefined}
      aria-pressed={interactive ? isActive : undefined}
      data-active={isActive ? "true" : undefined}
      data-report-face-card={face}
      onClick={onSelect}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">{face}</span>
        <span
          className="rounded-md border px-2.5 py-1.5 font-mono text-xs font-bold"
          style={gradeTierAccentStyleForGrade(faceCeiling)}
        >
          {bareGradeLabel(faceCeiling)}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-border bg-void">
        <div className="flex aspect-[2.5/3.5] w-full items-center justify-center bg-deep">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${face} card`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-3">
              No image
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <FaceAxisPanel
          label="L / R"
          firstLabel="L"
          firstValue={measurement.leftPct}
          secondLabel="R"
          secondValue={measurement.rightPct}
          tone={leftRightTone}
        />
        <FaceAxisPanel
          label="T / B"
          firstLabel="T"
          firstValue={measurement.topPct}
          secondLabel="B"
          secondValue={measurement.bottomPct}
          tone={topBottomTone}
        />
      </div>

      <div className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-text-2">
        Worst axis
        <span className={`ml-2 ${TONE_TEXT_CLASSES[worstAxisTone]}`}>
          {worstAxis} @ {measurement.worstAxisMaxPct}%
        </span>
        {isWorst && <span className="ml-2 text-owl">worst face</span>}
      </div>
    </article>
  );
}

export default function ResultsPanel({
  faces,
  activeFace,
  cardIdentity,
  cardSessionId,
  onActiveFaceChange,
  onCardIdentityChange,
  onDownloadReport,
  onMeasureAnother,
}: ResultsPanelProps) {
  const measured = measuredFaces(faces);
  if (measured.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 text-sm text-text-2">
        No saved result is ready.
      </section>
    );
  }

  const combined = combinedPsaResult(measured);
  const adjusted = measured.some((face) => face.adjusted);
  const currentActiveFace = activeFace ?? measured[0]?.face;

  return (
    <section className="space-y-8" data-results-report="true">
      <ReportCardName
        cardIdentity={cardIdentity}
        cardSessionId={cardSessionId}
        onCardIdentityChange={onCardIdentityChange}
      />
      <CombinedHero combined={combined} />

      <div className="mx-auto grid w-full max-w-[720px] gap-4 md:grid-cols-2">
        {measured.map((face) => (
          <ReportFaceCard
            key={face.face}
            {...face}
            isWorst={face.face === combined.worstFace.face}
            isActive={currentActiveFace === face.face}
            onSelect={onActiveFaceChange ? () => onActiveFaceChange(face.face) : undefined}
          />
        ))}
      </div>

      {adjusted && (
        <div className="text-center font-mono text-xs uppercase tracking-wider text-owl">
          Adjusted manually
        </div>
      )}

      <ActionButtons onDownloadReport={onDownloadReport} onMeasureAnother={onMeasureAnother} />
    </section>
  );
}
