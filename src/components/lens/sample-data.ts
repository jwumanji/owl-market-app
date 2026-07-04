import type { OverlayGeometry } from "@/lib/centering-math";
import type { LensFace, UploadFaceState } from "./lens-types";

export const SAMPLE_IMAGE_SIZE = { width: 420, height: 580 };

export const SAMPLE_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 580'%3E%3Crect width='420' height='580' fill='%23060a16'/%3E%3Crect x='42' y='34' width='336' height='512' rx='22' fill='%23121d32' stroke='%233d4d6a' stroke-width='3'/%3E%3Crect x='76' y='88' width='268' height='392' rx='10' fill='%230a1020' stroke='%237a88a8' stroke-width='2'/%3E%3Ccircle cx='210' cy='220' r='70' fill='%23e8a020' opacity='0.25'/%3E%3Ctext x='210' y='505' fill='%23e4eaf6' font-family='Arial' font-size='28' font-weight='700' text-anchor='middle'%3EOWL LENS%3C/text%3E%3C/svg%3E";

export const SAMPLE_FRONT_OVERLAY: OverlayGeometry = {
  outer: {
    tl: { x: 42, y: 34 },
    tr: { x: 378, y: 34 },
    br: { x: 378, y: 546 },
    bl: { x: 42, y: 546 },
  },
  inner: {
    tl: { x: 76, y: 88 },
    tr: { x: 344, y: 88 },
    br: { x: 344, y: 480 },
    bl: { x: 76, y: 480 },
  },
};

export const SAMPLE_BACK_OVERLAY: OverlayGeometry = {
  outer: {
    tl: { x: 48, y: 32 },
    tr: { x: 374, y: 32 },
    br: { x: 374, y: 548 },
    bl: { x: 48, y: 548 },
  },
  inner: {
    tl: { x: 86, y: 86 },
    tr: { x: 330, y: 86 },
    br: { x: 330, y: 474 },
    bl: { x: 86, y: 474 },
  },
};

export const SAMPLE_UPLOADS: Partial<Record<LensFace, UploadFaceState>> = {
  front: {
    fileName: "luffy-front.jpg",
    fileSize: 1840000,
    previewUrl: SAMPLE_IMAGE,
  },
};
