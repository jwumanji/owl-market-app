"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import {
  axisToneFromPcts,
  ceilingDisplayLabel,
  formatPct,
  formatRelativeTime,
} from "./history-utils";
import { gradeTierAccentStyleFromLabel } from "./grading";
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

const ROW_SIZE = {
  compact: {
    row: "rounded-md px-4 py-4",
    grid: "grid-cols-[64px_minmax(0,0.95fr)_minmax(0,1.15fr)_52px_76px]",
    thumbnail: "w-16",
    name: "text-[17px]",
    input: "px-3 py-2.5 text-[17px]",
    adjusted: "text-[10px]",
    ratioBlock: "space-y-2",
    ratioRow: "gap-x-4 gap-y-1 text-[14px] leading-6",
    ceiling: "h-[52px] w-[52px] text-[26px]",
    time: "w-[76px] text-[12px]",
  },
  full: {
    row: "rounded-lg px-5 py-[18px]",
    grid: "grid-cols-[72px_minmax(0,1fr)_minmax(0,1.2fr)_56px_84px_auto]",
    thumbnail: "w-[72px]",
    name: "text-[18px]",
    input: "px-3 py-2.5 text-[18px]",
    adjusted: "text-[10px]",
    ratioBlock: "space-y-2.5",
    ratioRow: "gap-x-4 gap-y-1 text-[14px] leading-6",
    ceiling: "h-14 w-14 text-[28px]",
    time: "w-[84px] text-[12px]",
  },
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

function faceRatioRows(face: PreGradeFace | null, label: "F" | "B", variant: "full" | "compact") {
  if (!face) return null;
  const lrTone = axisToneFromPcts(face.leftPct, face.rightPct);
  const tbTone = axisToneFromPcts(face.topPct, face.bottomPct);
  const size = ROW_SIZE[variant];

  return (
    <div className={`flex min-w-0 flex-wrap items-center font-mono ${size.ratioRow}`}>
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

  const displayName = localName.trim() || "Add card name...";
  const ceilingLabel = ceilingDisplayLabel(session.ceiling);
  const href = `/admin/lens/pregrade?session=${encodeURIComponent(session.id)}`;
  const size = ROW_SIZE[variant];

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
        size.row
      }`}
    >
      <a className="absolute inset-0 z-0" href={href} aria-label={`Open ${displayName}`} />
      <div
        className={`relative z-10 grid items-center gap-3 ${
          size.grid
        }`}
      >
        <div
          className={`aspect-[2.5/3.5] overflow-hidden rounded-md border border-border bg-deep ${size.thumbnail}`}
          data-history-thumbnail="true"
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
              className={`w-full rounded-md border border-owl/50 bg-deep text-text outline-none ${size.input}`}
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
              className={`block max-w-full truncate bg-transparent p-0 text-left font-semibold ${size.name} ${
                localName.trim()
                  ? "text-text hover:text-owl"
                  : "italic text-text-2 hover:text-text"
              }`}
            >
              {displayName}
            </button>
          )}
          {session.manualAdjustment && (
            <div className={`mt-1.5 font-mono font-bold uppercase tracking-wider text-owl ${size.adjusted}`}>
              Adjusted manually
            </div>
          )}
          {error && <div className="mt-1 text-xs text-loss">{error}</div>}
        </div>

        <div className={`min-w-0 ${size.ratioBlock}`} data-history-ratios="true">
          {faceRatioRows(session.front, "F", variant)}
          {faceRatioRows(session.back, "B", variant)}
        </div>

        <div
          className={`flex shrink-0 items-center justify-center rounded-md border text-center font-mono font-bold leading-none ${size.ceiling}`}
          style={gradeTierAccentStyleFromLabel(ceilingLabel)}
          data-history-ceiling="true"
        >
          {ceilingLabel}
        </div>

        <div className={`shrink-0 whitespace-nowrap text-right font-mono text-text-2 ${size.time}`}>
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
