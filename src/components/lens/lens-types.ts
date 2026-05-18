import type { ComputedCenteringMeasurement, OverlayGeometry } from "@/lib/centering-math";

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
  previewUrl: string | null;
};
