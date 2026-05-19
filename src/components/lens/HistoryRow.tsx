"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import {
  axisToneFromPcts,
  ceilingDisplayLabel,
  formatPct,
  formatRelativeTime,
  sessionWorstMax,
  toneFromHistoryWorstMax,
} from "./history-utils";
import type { PreGradeFace, PreGradeSession } from "./lens-types";

export type HistoryRowProps = {
  session: PreGradeSession;
  variant: "full" | "compact";
  onRename?: (id: string, newName: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
};

const TONE_TEXT_CLASSES = {
  gain: "text-gain",
  owl: "text-owl",
  loss: "text-loss",
} as const;

const TONE_PILL_CLASSES = {
  gain: "border-gain/40 bg-gain/10 text-gain",
  owl: "border-owl/40 bg-owl/10 text-owl",
  loss: "border-loss/40 bg-loss/10 text-loss",
} as const;

export async function saveHistoryRowRename({
  id,
  initialName,
  draftName,
  onRename,
}: {
  id: string;
  initialName: string | null;
  draftName: string;
  onRename?: (id: string, newName: string) => Promise<void>;
}) {
  const nextName = draftName.trim();
  const currentName = (initialName ?? "").trim();
  if (!onRename || nextName === currentName) return nextName;
  await onRename(id, nextName);
  return nextName;
}

export async function confirmAndDeleteHistoryRow({
  id,
  onDelete,
  confirmDelete,
}: {
  id: string;
  onDelete?: (id: string) => Promise<void>;
  confirmDelete: (message: string) => boolean;
}) {
  if (!onDelete) return false;
  if (!confirmDelete("Delete this pre-grade? This also removes the saved images.")) return false;
  await onDelete(id);
  return true;
}

function faceRatioRows(face: PreGradeFace | null, label: "F" | "B") {
  if (!face) return null;
  const lrTone = axisToneFromPcts(face.leftPct, face.rightPct);
  const tbTone = axisToneFromPcts(face.topPct, face.bottomPct);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] leading-5">
      <span className="font-bold text-text-2">{label}:</span>
      <span className={TONE_TEXT_CLASSES[lrTone]}>
        L {formatPct(face.leftPct)} / R {formatPct(face.rightPct)}
      </span>
      <span className={TONE_TEXT_CLASSES[tbTone]}>
        T {formatPct(face.topPct)} / B {formatPct(face.bottomPct)}
      </span>
    </div>
  );
}

export default function HistoryRow({ session, variant, onRename, onDelete }: HistoryRowProps) {
  const [localName, setLocalName] = useState(session.cardIdentity ?? "");
  const [draftName, setDraftName] = useState(session.cardIdentity ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    setLocalName(session.cardIdentity ?? "");
    setDraftName(session.cardIdentity ?? "");
  }, [session.cardIdentity]);

  const worstMax = sessionWorstMax(session);
  const tone = toneFromHistoryWorstMax(worstMax);
  const displayName = localName.trim() || "Add card name...";
  const href = `/admin/lens/pregrade?session=${encodeURIComponent(session.id)}`;

  async function commitRename() {
    setIsBusy(true);
    setError(null);
    try {
      const nextName = await saveHistoryRowRename({
        id: session.id,
        initialName: localName,
        draftName,
        onRename,
      });
      setLocalName(nextName);
      setDraftName(nextName);
      setIsEditing(false);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not rename pre-grade.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete() {
    setIsBusy(true);
    setError(null);
    try {
      await confirmAndDeleteHistoryRow({
        id: session.id,
        onDelete,
        confirmDelete: (message) => window.confirm(message),
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete pre-grade.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <article
      data-history-row-variant={variant}
      className={`relative overflow-hidden border border-border bg-surface transition-colors hover:border-border-2 hover:bg-surf2 ${
        variant === "compact" ? "rounded-md px-3 py-2.5" : "rounded-lg px-4 py-3"
      }`}
    >
      <a className="absolute inset-0 z-0" href={href} aria-label={`Open ${displayName}`} />
      <div
        className={`relative z-10 grid items-center gap-3 ${
          variant === "compact"
            ? "grid-cols-[38px_minmax(150px,1fr)_minmax(210px,auto)_auto_auto]"
            : "grid-cols-[48px_minmax(190px,1fr)_minmax(260px,1.1fr)_auto_auto_auto]"
        }`}
      >
        <div
          className={`overflow-hidden rounded border border-border bg-deep ${
            variant === "compact" ? "h-[52px] w-[38px]" : "h-[58px] w-[42px]"
          }`}
        >
          {session.front?.signedImageUrl ? (
            <img
              src={session.front.signedImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-mono text-[9px] uppercase text-text-3">
              Image
            </div>
          )}
        </div>

        <div className="min-w-0">
          {isEditing ? (
            <input
              autoFocus
              value={draftName}
              disabled={isBusy}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => {
                if (skipBlurCommit.current) {
                  skipBlurCommit.current = false;
                  return;
                }
                void commitRename();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  skipBlurCommit.current = true;
                  setDraftName(localName);
                  setIsEditing(false);
                }
              }}
              placeholder="Add card name..."
              className="w-full rounded-md border border-owl/50 bg-deep px-2.5 py-2 text-sm text-text outline-none"
            />
          ) : (
            <button
              type="button"
              disabled={!onRename}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!onRename) return;
                setDraftName(localName);
                setIsEditing(true);
              }}
              className={`block max-w-full truncate bg-transparent p-0 text-left text-sm font-semibold ${
                localName.trim()
                  ? "text-text hover:text-owl"
                  : "italic text-text-2 hover:text-text"
              }`}
            >
              {displayName}
            </button>
          )}
          {session.manualAdjustment && (
            <div className="mt-1 font-mono text-[9px] font-bold uppercase tracking-wider text-owl">
              Adjusted manually
            </div>
          )}
          {error && <div className="mt-1 text-xs text-loss">{error}</div>}
        </div>

        <div className={variant === "compact" ? "hidden min-w-0 md:block" : "min-w-0"}>
          {faceRatioRows(session.front, "F")}
          {faceRatioRows(session.back, "B")}
        </div>

        <div className={`rounded-md border px-2.5 py-1.5 text-center font-mono text-xs font-bold ${TONE_PILL_CLASSES[tone]}`}>
          {ceilingDisplayLabel(session.ceiling)}
        </div>

        <div className="whitespace-nowrap text-right font-mono text-[11px] text-text-2">
          {formatRelativeTime(session.createdAt)}
        </div>

        {variant === "full" && onDelete && (
          <button
            type="button"
            disabled={isBusy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleDelete();
            }}
            className="rounded-md border border-transparent px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-loss transition-colors hover:border-loss/40 hover:bg-loss/10 disabled:cursor-wait disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
