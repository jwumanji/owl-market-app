"use client";

import type { LensFace } from "./lens-types";
export type { LensFace };

type FaceTabsProps = {
  activeFace: LensFace;
  faces?: LensFace[];
  adjustedFaces?: Partial<Record<LensFace, boolean>>;
  unviewedFaces?: Partial<Record<LensFace, boolean>>;
  onChange: (face: LensFace) => void;
};

export default function FaceTabs({
  activeFace,
  faces = ["front", "back"],
  adjustedFaces = {},
  unviewedFaces = {},
  onChange,
}: FaceTabsProps) {
  return (
    <div className="mb-3 flex gap-7 border-b border-border">
      {faces.map((face) => (
        <button
          key={face}
          type="button"
          onClick={() => onChange(face)}
          className={`flex items-center gap-2 border-b-2 px-0 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeFace === face
              ? "border-owl text-owl"
              : "border-transparent text-text-2 hover:text-text"
          }`}
        >
          {face}
          {unviewedFaces[face] && <span aria-label={`${face} unviewed`} className="h-1.5 w-1.5 rounded-full bg-owl" />}
          {adjustedFaces[face] && <span className="text-[9px] font-medium tracking-normal text-owl">· adj</span>}
        </button>
      ))}
    </div>
  );
}
