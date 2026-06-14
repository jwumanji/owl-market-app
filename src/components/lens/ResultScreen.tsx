"use client";

/**
 * Unified pregrade Result screen (Phase 2 collapse of ReviewWorkspace + ResultsPanel).
 *
 * One adjust-in-place screen: the report (combined ceiling, per-grader strip, per-face
 * ratios) is always visible — pre-save included — while the card workspace toggles between
 * a read-only overlay (`view`) and the interactive editor (`adjust`) via the SAME
 * ImageOverlayPanel (mode "readonly" vs "review"/"edit"). The CV/save/overlay/DB plumbing
 * is untouched; this is purely the presentation collapse.
 *
 * ReviewWorkspace/ResultsPanel/MeasurementNumbersPanel still exist for the (dev-only)
 * EditWorkspace + LensComposersDev harness and their unit tests; retire them in a later cleanup.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  computeMeasurements,
  type OverlayGeometry,
  type PsaGrade,
} from "@/lib/centering-math";
import FaceRatioCard from "./FaceRatioCard";
import FaceTabs from "./FaceTabs";
import FreeCornersToggle from "./FreeCornersToggle";
import GraderStrip from "./GraderStrip";
import ImageOverlayPanel from "./ImageOverlayPanel";
import {
  bareGradeLabel,
  gradeTierAccentStyleForGrade,
  gradeTierColorForGrade,
  graderResultsFromFaces,
  psaTenBorderlineNote,
  TONE_TEXT_CLASSES,
  type GraderResult,
} from "./grading";
import {
  reportCardNameDisplay,
  reportCardNameKeyAction,
  saveReportCardIdentity,
} from "./report-card-name";
import type { LensFace, LensFaceState, LensMeasuredFace } from "./lens-types";

type ResultScreenProps = {
  faces: Partial<Record<LensFace, LensFaceState>>;
  activeFace: LensFace;
  resultMode: "view" | "adjust";
  saved: boolean;
  cardIdentity?: string | null;
  cardSessionId?: string | null;
  saving?: boolean;
  notice?: ReactNode;
  allowAddBack?: boolean;
  onActiveFaceChange: (face: LensFace) => void;
  onEnterAdjust: () => void;
  onExitAdjust: () => void;
  onOverlayChange: (face: LensFace, overlay: OverlayGeometry) => void;
  onFreeCornersChange: (face: LensFace, enabled: boolean) => void;
  onResetFace: (face: LensFace) => void;
  onAddBack?: () => void;
  onSave: () => void;
  onCardIdentityChange?: (value: string) => void;
  onReMeasure: () => void;
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

function measuredFaces(faces: Partial<Record<LensFace, LensFaceState>>): LensMeasuredFace[] {
  return (["front", "back"] as LensFace[])
    .map((face) => faces[face])
    .filter((face): face is LensFaceState => Boolean(face))
    .map((face) => ({ ...face, measurement: computeMeasurements(face.overlay) }));
}

function combinedResult(measured: LensMeasuredFace[]) {
  const front = measured.find((face) => face.face === "front") ?? measured[0];
  const back = front.face === "front" ? measured.find((face) => face.face === "back") ?? null : null;
  const graderResults = graderResultsFromFaces({
    front: { worstMax: front.measurement.worstAxisMaxPct },
    back: back ? { worstMax: back.measurement.worstAxisMaxPct } : null,
  });
  const psa = graderResults[0] as GraderResult<PsaGrade>;
  return { graderResults, psa, front, back };
}

/**
 * Save-aware card-name editor: post-save commits via the session PATCH (saveReportCardIdentity);
 * pre-save there is no session yet, so it only updates local wizard state.
 */
function ResultCardName({
  cardIdentity,
  cardSessionId,
  saved,
  onCardIdentityChange,
}: {
  cardIdentity?: string | null;
  cardSessionId?: string | null;
  saved: boolean;
  onCardIdentityChange?: (value: string) => void;
}) {
  const [draft, setDraft] = useState(cardIdentity ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    setDraft(cardIdentity ?? "");
  }, [cardIdentity]);

  async function commit() {
    const next = draft.trim();
    setIsEditing(false);
    if (next === (cardIdentity ?? "").trim()) {
      setDraft(next);
      return;
    }
    if (saved && cardSessionId) {
      setIsSaving(true);
      setError(null);
      try {
        await saveReportCardIdentity({ sessionId: cardSessionId, cardIdentity: next });
        onCardIdentityChange?.(next);
      } catch (renameError) {
        setError(renameError instanceof Error ? renameError.message : "Could not rename pre-grade.");
        setDraft(cardIdentity ?? "");
      } finally {
        setIsSaving(false);
      }
      return;
    }
    onCardIdentityChange?.(next);
  }

  function cancel() {
    skipBlurCommit.current = true;
    setDraft(cardIdentity ?? "");
    setError(null);
    setIsEditing(false);
  }

  return (
    <div data-result-card-name="true">
      <div className="font-mono-2 text-[10px] font-bold uppercase tracking-widest text-ink-2">Card name</div>
      {isEditing ? (
        <input
          autoFocus
          value={draft}
          disabled={isSaving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (skipBlurCommit.current) {
              skipBlurCommit.current = false;
              return;
            }
            void commit();
          }}
          onKeyDown={(event) => {
            const action = reportCardNameKeyAction(event.key);
            if (!action) return;
            event.preventDefault();
            if (action === "commit") void commit();
            else cancel();
          }}
          aria-label="Card name"
          placeholder="Untitled card"
          className="mt-1 w-full max-w-md rounded-c-sm border-[1.5px] border-coral/60 bg-bg-2 px-3 py-2 font-grotesk text-2xl font-bold text-ink outline-none placeholder:text-ink-3 disabled:cursor-wait disabled:opacity-60"
        />
      ) : (
        <div className="mt-1 inline-flex max-w-full items-center gap-2">
          <span className="truncate font-grotesk text-2xl font-bold text-ink">{reportCardNameDisplay(cardIdentity)}</span>
          <button
            type="button"
            onClick={() => {
              setDraft(cardIdentity ?? "");
              setIsEditing(true);
            }}
            aria-label="Edit card name"
            data-card-name-edit-button="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-c-sm border-[1.5px] border-transparent text-ink-2 transition-colors hover:border-ink hover:bg-bg-3 hover:text-coral"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && <div className="mt-1 text-sm text-loss-2">{error}</div>}
    </div>
  );
}

function CombinedCeilingCard({ combined }: { combined: ReturnType<typeof combinedResult> }) {
  const { psa, front, back } = combined;
  const borderlineNote = psaTenBorderlineNote(front.measurement.worstAxisMaxPct, psa.ceiling);

  return (
    <div
      className="rounded-c-md border-[1.5px] p-4 text-center"
      style={gradeTierAccentStyleForGrade(psa.ceiling)}
      data-result-combined="true"
    >
      <div className="font-mono-2 text-[10px] font-bold uppercase tracking-widest text-ink-2">Combined ceiling</div>
      <div
        className="mt-1 font-mono-2 text-5xl font-bold leading-none"
        style={{ color: gradeTierColorForGrade(psa.ceiling) }}
      >
        {bareGradeLabel(psa.ceiling)}
      </div>
      <div className="mt-1 font-mono-2 text-[10px] text-ink-2">
        {back ? "worse of front · back" : "front only (back not measured)"}
      </div>
      {/* Borderline amber comes from the same owl-tone source as the per-axis band (grade-8b). */}
      {borderlineNote && (
        <div className={`mt-1 font-mono-2 text-[10px] font-bold uppercase tracking-wider ${TONE_TEXT_CLASSES.owl}`}>
          {borderlineNote}
        </div>
      )}
      <GraderStrip
        frontWorstMax={front.measurement.worstAxisMaxPct}
        backWorstMax={back?.measurement.worstAxisMaxPct ?? null}
      />
    </div>
  );
}

export default function ResultScreen({
  faces,
  activeFace,
  resultMode,
  saved,
  cardIdentity,
  cardSessionId,
  saving = false,
  notice,
  allowAddBack = true,
  onActiveFaceChange,
  onEnterAdjust,
  onExitAdjust,
  onOverlayChange,
  onFreeCornersChange,
  onResetFace,
  onAddBack,
  onSave,
  onCardIdentityChange,
  onReMeasure,
  onMeasureAnother,
}: ResultScreenProps) {
  const measured = measuredFaces(faces);
  if (measured.length === 0) {
    return (
      <section className="rounded-c-md border-[1.5px] border-ink bg-bg-2 p-5 text-sm text-ink-2">
        No measurement is ready yet.
      </section>
    );
  }

  const faceList = measured.map((face) => face.face);
  const active = measured.find((face) => face.face === activeFace) ?? measured[0];
  const combined = combinedResult(measured);
  const hasBack = measured.some((face) => face.face === "back");
  const isAdjust = resultMode === "adjust";
  // view → non-interactive overlay; adjust → editor (edit keeps the saved baseline, review is a fresh draft).
  const editorMode: "readonly" | "review" | "edit" = isAdjust ? (saved ? "edit" : "review") : "readonly";
  const adjustedFaces = Object.fromEntries(measured.map((face) => [face.face, Boolean(face.adjusted)]));
  const unviewedFaces = Object.fromEntries(measured.map((face) => [face.face, Boolean(face.unviewed)]));
  const showSave = !saved || isAdjust;
  const canAddBack = Boolean(allowAddBack && !hasBack && active.face === "front" && onAddBack);

  return (
    <section className="flex min-h-0 flex-1 flex-col space-y-4" data-result-screen="true" data-result-mode={resultMode}>
      <ResultCardName
        cardIdentity={cardIdentity}
        cardSessionId={cardSessionId}
        saved={saved}
        onCardIdentityChange={onCardIdentityChange}
      />

      {typeof notice === "string" ? (
        <div className="rounded-c-md border-[1.5px] border-coral/50 bg-bg-3 px-4 py-3 text-sm text-ink">{notice}</div>
      ) : (
        notice
      )}

      <div className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {faceList.length > 1 && (
            <FaceTabs
              activeFace={active.face}
              faces={faceList}
              adjustedFaces={adjustedFaces}
              unviewedFaces={unviewedFaces}
              onChange={(face) => onActiveFaceChange(face)}
            />
          )}

          <ImageOverlayPanel
            overlay={active.overlay}
            imageSize={active.imageSize}
            imageUrl={active.imageUrl}
            freeCorners={Boolean(active.freeCorners)}
            adjusted={Boolean(active.adjusted)}
            mode={editorMode}
            onOverlayChange={(overlay) => onOverlayChange(active.face, overlay)}
          />

          <div className="flex flex-wrap items-center gap-2">
            {isAdjust ? (
              <>
                <button
                  type="button"
                  onClick={onExitAdjust}
                  data-done-adjusting="true"
                  className="rounded-c-sm bg-grad-brand px-4 py-2.5 font-mono-2 text-xs font-bold uppercase tracking-wider text-bg-2 transition-opacity hover:opacity-90"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => onResetFace(active.face)}
                  disabled={!active.adjusted}
                  className="rounded-c-sm border-[1.5px] border-ink bg-bg-2 px-4 py-2.5 font-mono-2 text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:bg-bg-3 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Reset {active.face}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onEnterAdjust}
                data-adjust-borders="true"
                className="inline-flex items-center gap-2 rounded-c-sm border-[1.5px] border-ink bg-bg-2 px-4 py-2.5 font-mono-2 text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:bg-bg-3"
              >
                <PencilIcon className="h-4 w-4" />
                Adjust borders
              </button>
            )}
          </div>

          {isAdjust && (
            <FreeCornersToggle
              enabled={Boolean(active.freeCorners)}
              onChange={(enabled) => onFreeCornersChange(active.face, enabled)}
            />
          )}
        </div>

        <div className="space-y-3">
          <CombinedCeilingCard combined={combined} />
          {measured.map((face) => (
            <FaceRatioCard
              key={face.face}
              face={face.face}
              measurement={face.measurement}
              isActive={face.face === active.face}
              onSelect={() => onActiveFaceChange(face.face)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t-[1.5px] border-ink pt-4">
        {canAddBack && (
          <button
            type="button"
            onClick={onAddBack}
            className="rounded-c-sm border-[1.5px] border-coral bg-bg-3 px-4 py-2.5 font-mono-2 text-xs font-bold uppercase tracking-wider text-coral transition-opacity hover:opacity-80"
          >
            ＋ Add back image
          </button>
        )}
        {saved && !isAdjust && (
          <button
            type="button"
            onClick={onReMeasure}
            data-re-measure="true"
            className="rounded-c-sm border-[1.5px] border-ink bg-bg-2 px-4 py-2.5 font-mono-2 text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:bg-bg-3"
          >
            Re-measure
          </button>
        )}
        <button
          type="button"
          onClick={onMeasureAnother}
          data-measure-another="true"
          className="rounded-c-sm border-[1.5px] border-ink bg-bg-2 px-4 py-2.5 font-mono-2 text-xs font-bold uppercase tracking-wider text-ink transition-colors hover:bg-bg-3"
        >
          ＋ Measure another
        </button>
        {showSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            aria-busy={saving}
            data-save-to-inventory="true"
            className="ml-auto rounded-c-sm bg-grad-brand px-5 py-2.5 font-mono-2 text-xs font-bold uppercase tracking-wider text-bg-2 transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? "Saving…" : saved ? "Update measurement" : "＋ Save to inventory"}
          </button>
        )}
      </div>
    </section>
  );
}
