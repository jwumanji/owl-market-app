"use client";

import { computeMeasurements, type OverlayGeometry } from "@/lib/centering-math";
import FaceTabs from "./FaceTabs";
import ImageOverlayPanel from "./ImageOverlayPanel";
import MeasurementNumbersPanel from "./MeasurementNumbersPanel";
import type { LensFace, LensFaceState } from "./lens-types";

type ReviewWorkspaceProps = {
  faces: Partial<Record<LensFace, LensFaceState>>;
  activeFace: LensFace;
  mode?: "review" | "edit";
  cardIdentity?: string | null;
  notice?: string | null;
  onActiveFaceChange: (face: LensFace) => void;
  onOverlayChange: (face: LensFace, overlay: OverlayGeometry) => void;
  onFreeCornersChange: (face: LensFace, enabled: boolean) => void;
  onAddBack?: () => void;
  onSave: () => void;
  onResetFace: (face: LensFace) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

function availableFaces(faces: Partial<Record<LensFace, LensFaceState>>) {
  return (["front", "back"] as LensFace[]).filter((face) => Boolean(faces[face]));
}

export default function ReviewWorkspace({
  faces,
  activeFace,
  mode = "review",
  cardIdentity,
  notice,
  onActiveFaceChange,
  onOverlayChange,
  onFreeCornersChange,
  onAddBack,
  onSave,
  onResetFace,
  onCancel,
  onDelete,
}: ReviewWorkspaceProps) {
  const faceList = availableFaces(faces);
  const active = faces[activeFace] ?? faces.front ?? faces.back;

  if (!active) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 text-sm text-text-2">
        No overlay is ready to review.
      </section>
    );
  }

  const measurements = Object.fromEntries(
    faceList.map((face) => [face, computeMeasurements(faces[face]!.overlay)])
  ) as Partial<Record<LensFace, ReturnType<typeof computeMeasurements>>>;
  const adjustedFaces = Object.fromEntries(faceList.map((face) => [face, Boolean(faces[face]?.adjusted)]));
  const unviewedFaces = Object.fromEntries(faceList.map((face) => [face, Boolean(faces[face]?.unviewed)]));
  const hasBack = Boolean(faces.back);

  return (
    <section className="space-y-3">
      {cardIdentity && (
        <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-owl">
          {cardIdentity}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-owl/40 bg-owl/10 px-4 py-3 text-sm text-text">
          {notice}
        </div>
      )}
      {faceList.length > 1 && (
        <FaceTabs
          activeFace={activeFace}
          faces={faceList}
          adjustedFaces={adjustedFaces}
          unviewedFaces={unviewedFaces}
          onChange={onActiveFaceChange}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ImageOverlayPanel
          overlay={active.overlay}
          imageSize={active.imageSize}
          imageUrl={active.imageUrl}
          freeCorners={Boolean(active.freeCorners)}
          adjusted={Boolean(active.adjusted)}
          mode={mode}
          onOverlayChange={(overlay) => onOverlayChange(active.face, overlay)}
        />
        <MeasurementNumbersPanel
          activeFace={active.face}
          faces={faces}
          measurements={measurements}
          freeCorners={Boolean(active.freeCorners)}
          adjusted={Boolean(active.adjusted)}
          mode={mode}
          showAddBack={!hasBack && active.face === "front" && mode === "review"}
          saveLabel={mode === "edit" ? "Update measurement" : undefined}
          resetLabel={mode === "edit" ? `Revert ${active.face} to saved` : undefined}
          onFreeCornersChange={(enabled) => onFreeCornersChange(active.face, enabled)}
          onAddBack={onAddBack}
          onSave={onSave}
          onReset={() => onResetFace(active.face)}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </div>
    </section>
  );
}
