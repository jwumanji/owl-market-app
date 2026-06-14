"use client";

import type { LensFace } from "./lens-types";
export type { LensFace };

type FaceTabsProps = {
  activeFace: LensFace;
  faces?: LensFace[];
  adjustedFaces?: Partial<Record<LensFace, boolean>>;
  uploadedFaces?: Partial<Record<LensFace, boolean>>;
  emptyFaceHints?: Partial<Record<LensFace, string>>;
  unviewedFaces?: Partial<Record<LensFace, boolean>>;
  className?: string;
  onChange: (face: LensFace) => void;
};

export default function FaceTabs({
  activeFace,
  faces = ["front", "back"],
  adjustedFaces = {},
  uploadedFaces = {},
  emptyFaceHints = {},
  unviewedFaces = {},
  className = "mb-3",
  onChange,
}: FaceTabsProps) {
  return (
    <div className={`${className} flex gap-7 border-b-[1.5px] border-ink`}>
      {faces.map((face) => (
        <button
          key={face}
          type="button"
          onClick={() => onChange(face)}
          className={`flex items-center gap-2 border-b-2 px-0 py-2.5 font-mono-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeFace === face
              ? "border-coral text-coral"
              : "border-transparent text-ink-2 hover:text-ink"
          }`}
        >
          {face}
          {uploadedFaces[face] && <span aria-label={`${face} uploaded`} className="h-1.5 w-1.5 rounded-full bg-gain-2" />}
          {!uploadedFaces[face] && emptyFaceHints[face] && (
            <span className="text-[9px] font-medium tracking-normal text-ink-3">
              ·{emptyFaceHints[face]}
            </span>
          )}
          {unviewedFaces[face] && <span aria-label={`${face} unviewed`} className="h-1.5 w-1.5 rounded-full bg-coral" />}
          {adjustedFaces[face] && <span className="text-[9px] font-medium tracking-normal text-coral">· adj</span>}
        </button>
      ))}
    </div>
  );
}
