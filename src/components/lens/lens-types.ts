import type { ComputedCenteringMeasurement, OverlayGeometry, PsaCeiling } from "@/lib/centering-math";
export type { PsaCeiling };

export type LensFace = "front" | "back";

export type LensFaceState = {
  face: LensFace;
  overlay: OverlayGeometry;
  imageUrl: string | null;
  imageSize: { width: number; height: number };
  adjusted?: boolean;
  freeCorners?: boolean;
  unviewed?: boolean;
};

export type LensMeasuredFace = LensFaceState & {
  measurement: ComputedCenteringMeasurement;
};

export type UploadFaceState = {
  fileName: string;
  fileSize?: number | null;
  file?: File | null;
  imageSize?: { width: number; height: number } | null;
  contentType?: string | null;
  previewUrl: string | null;
};

export type PreGradeFace = {
  id: string;
  face: LensFace;
  createdAt: string | null;
  imagePath: string | null;
  signedImageUrl: string | null;
  overlayGeometry: unknown;
  leftPct: number | null;
  rightPct: number | null;
  topPct: number | null;
  bottomPct: number | null;
  worstAxis: "leftRight" | "topBottom";
  worstAxisMaxPct: number | null;
  psaCeiling: PsaCeiling;
  manualAdjustment: boolean;
};

export type PreGradeSession = {
  id: string;
  cardSessionId: string | null;
  cardIdentity: string | null;
  createdAt: string | null;
  ceiling: PsaCeiling;
  manualAdjustment: boolean;
  front: PreGradeFace | null;
  back: PreGradeFace | null;
};
