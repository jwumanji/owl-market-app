"use client";

import { useState } from "react";
import type { OverlayGeometry } from "@/lib/centering-math";
import EditWorkspace from "./EditWorkspace";
import ImageOverlayDev from "./ImageOverlayDev";
import ResultsPanel from "./ResultsPanel";
import ReviewWorkspace from "./ReviewWorkspace";
import UploadPane from "./UploadPane";
import type { LensFace, LensFaceState, UploadFaceState } from "./lens-types";
import {
  SAMPLE_BACK_OVERLAY,
  SAMPLE_FRONT_OVERLAY,
  SAMPLE_IMAGE,
  SAMPLE_IMAGE_SIZE,
  SAMPLE_UPLOADS,
} from "./sample-data";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-void p-5">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-owl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function initialFaces(): Record<LensFace, LensFaceState> {
  return {
    front: {
      face: "front",
      overlay: SAMPLE_FRONT_OVERLAY,
      imageUrl: SAMPLE_IMAGE,
      imageSize: SAMPLE_IMAGE_SIZE,
      adjusted: false,
      freeCorners: false,
    },
    back: {
      face: "back",
      overlay: SAMPLE_BACK_OVERLAY,
      imageUrl: SAMPLE_IMAGE,
      imageSize: SAMPLE_IMAGE_SIZE,
      adjusted: false,
      freeCorners: false,
      unviewed: true,
    },
  };
}

export default function LensComposersDev() {
  const [uploads, setUploads] = useState<Partial<Record<LensFace, UploadFaceState>>>(SAMPLE_UPLOADS);
  const [cardIdentity] = useState("Monkey D. Luffy OP01-001");
  const [activeFace, setActiveFace] = useState<LensFace>("front");
  const [reviewFaces, setReviewFaces] = useState<Partial<Record<LensFace, LensFaceState>>>(() => initialFaces());
  const [editActiveFace, setEditActiveFace] = useState<LensFace>("front");
  const [editFaces, setEditFaces] = useState<Record<LensFace, LensFaceState>>(() => initialFaces());
  const reviewBackUploaded = Boolean(reviewFaces.back);

  function setReviewOverlay(face: LensFace, overlay: OverlayGeometry) {
    setReviewFaces((current) => ({
      ...current,
      [face]: {
        ...current[face]!,
        overlay,
        adjusted: true,
      },
    }));
  }

  function setReviewFreeCorners(face: LensFace, enabled: boolean) {
    setReviewFaces((current) => ({
      ...current,
      [face]: {
        ...current[face]!,
        freeCorners: enabled,
      },
    }));
  }

  function setEditOverlay(face: LensFace, overlay: OverlayGeometry) {
    setEditFaces((current) => ({
      ...current,
      [face]: {
        ...current[face],
        overlay,
        adjusted: true,
      },
    }));
  }

  function setEditFreeCorners(face: LensFace, enabled: boolean) {
    setEditFaces((current) => ({
      ...current,
      [face]: {
        ...current[face],
        freeCorners: enabled,
      },
    }));
  }

  function resetFace(face: LensFace) {
    const reset = initialFaces()[face];
    setReviewFaces((current) => ({ ...current, [face]: reset }));
  }

  function toggleReviewBackUploaded() {
    if (reviewBackUploaded) {
      setActiveFace("front");
      setReviewFaces((current) => {
        const next = { ...current };
        delete next.back;
        return next;
      });
      return;
    }

    setReviewFaces((current) => ({
      ...current,
      back: initialFaces().back,
    }));
  }

  function revertEditFace(face: LensFace) {
    const reset = initialFaces()[face];
    setEditFaces((current) => ({ ...current, [face]: reset }));
  }

  return (
    <div className="space-y-6">
      <Section title="Step 2 · ImageOverlayPanel">
        <ImageOverlayDev />
      </Section>

      <Section title="Step 3 · UploadPane">
        <div className="grid gap-4 lg:grid-cols-2">
          {(["front", "back"] as LensFace[]).map((face) => (
            <UploadPane
              key={face}
              face={face}
              upload={uploads[face]}
              onFileSelect={(selectedFace, file) => {
                setUploads((current) => ({
                  ...current,
                  [selectedFace]: {
                    fileName: file.name,
                    fileSize: file.size,
                    previewUrl: URL.createObjectURL(file),
                  },
                }));
              }}
              onClearFace={(selectedFace) =>
                setUploads((current) => {
                  const next = { ...current };
                  delete next[selectedFace];
                  return next;
                })
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Step 3 · ReviewWorkspace">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={toggleReviewBackUploaded}
            className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:text-owl"
          >
            {reviewBackUploaded ? "Hide back mock" : "Show back mock"}
          </button>
        </div>
        <ReviewWorkspace
          faces={reviewFaces}
          activeFace={activeFace}
          cardIdentity={cardIdentity}
          onActiveFaceChange={(face) => {
            setActiveFace(face);
            setReviewFaces((current) => ({
              ...current,
              [face]: { ...current[face]!, unviewed: false },
            }));
          }}
          onOverlayChange={setReviewOverlay}
          onFreeCornersChange={setReviewFreeCorners}
          onAddBack={() => undefined}
          onSave={() => undefined}
          onResetFace={resetFace}
          onCancel={() => undefined}
        />
      </Section>

      <Section title="Step 3 · ResultsPanel + FaceResultCard">
        <ResultsPanel
          faces={reviewFaces}
          activeFace={activeFace}
          cardIdentity={cardIdentity}
          onActiveFaceChange={setActiveFace}
          onDownloadReport={() => undefined}
          onMeasureAnother={() => undefined}
        />
      </Section>

      <Section title="Step 3 · EditWorkspace">
        <EditWorkspace
          faces={editFaces}
          activeFace={editActiveFace}
          cardIdentity={cardIdentity}
          savedLabel="2h ago"
          onBackToHistory={() => undefined}
          onActiveFaceChange={(face) => {
            setEditActiveFace(face);
            setEditFaces((current) => ({
              ...current,
              [face]: { ...current[face], unviewed: false },
            }));
          }}
          onOverlayChange={setEditOverlay}
          onFreeCornersChange={setEditFreeCorners}
          onUpdate={() => undefined}
          onRevertFace={revertEditFace}
          onCancel={() => undefined}
          onDelete={() => undefined}
        />
      </Section>
    </div>
  );
}
