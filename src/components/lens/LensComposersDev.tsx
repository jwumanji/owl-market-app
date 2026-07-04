"use client";

// Dev-only composer sandbox (/admin/lens/dev). Slimmed in the Phase 2.5 retirement: the
// ReviewWorkspace / ResultsPanel / EditWorkspace sections were removed when those components
// were retired in favour of ResultScreen + the shared FaceRatioCard.

import { useState } from "react";
import ImageOverlayDev from "./ImageOverlayDev";
import UploadPane from "./UploadPane";
import type { LensFace, UploadFaceState } from "./lens-types";
import { SAMPLE_UPLOADS } from "./sample-data";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-void p-5">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-owl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function LensComposersDev() {
  const [uploads, setUploads] = useState<Partial<Record<LensFace, UploadFaceState>>>(SAMPLE_UPLOADS);

  return (
    <div className="space-y-6">
      <Section title="ImageOverlayPanel + FaceRatioCard">
        <ImageOverlayDev />
      </Section>

      <Section title="UploadPane">
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
    </div>
  );
}
