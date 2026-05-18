"use client";

import type { OverlayGeometry } from "@/lib/centering-math";
import ReviewWorkspace from "./ReviewWorkspace";
import type { LensFace, LensFaceState } from "./lens-types";

type EditWorkspaceProps = {
  faces: Partial<Record<LensFace, LensFaceState>>;
  activeFace: LensFace;
  cardIdentity: string;
  savedLabel: string;
  onBackToHistory: () => void;
  onActiveFaceChange: (face: LensFace) => void;
  onOverlayChange: (face: LensFace, overlay: OverlayGeometry) => void;
  onFreeCornersChange: (face: LensFace, enabled: boolean) => void;
  onUpdate: () => void;
  onRevertFace: (face: LensFace) => void;
  onCancel: () => void;
  onDelete: () => void;
};

export default function EditWorkspace({
  faces,
  activeFace,
  cardIdentity,
  savedLabel,
  onBackToHistory,
  onActiveFaceChange,
  onOverlayChange,
  onFreeCornersChange,
  onUpdate,
  onRevertFace,
  onCancel,
  onDelete,
}: EditWorkspaceProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button
            type="button"
            onClick={onBackToHistory}
            className="mb-2 bg-transparent p-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-2 hover:text-owl"
          >
            ← Back to history
          </button>
          <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-owl">
            Owl Lens · Pre-grade
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-text">{cardIdentity || "Saved pre-grade"}</h2>
          <div className="mt-1 text-sm text-text-2">Saved {savedLabel}</div>
        </div>
        <div className="rounded-md border border-owl/40 bg-owl/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-owl">
          Edit
        </div>
      </div>

      <ReviewWorkspace
        faces={faces}
        activeFace={activeFace}
        mode="edit"
        onActiveFaceChange={onActiveFaceChange}
        onOverlayChange={onOverlayChange}
        onFreeCornersChange={onFreeCornersChange}
        onSave={onUpdate}
        onResetFace={onRevertFace}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    </section>
  );
}
