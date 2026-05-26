"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent, type RefObject } from "react";
import { toPng } from "html-to-image";
import { useDropzone } from "react-dropzone";
import type { components, operations } from "@/lib/owl-lens/openapi.generated";

export type MeasurementResponse =
  operations["measureCardCentering"]["responses"][200]["content"]["application/json"];
export type MeasurementOverlay = components["schemas"]["MeasurementOverlay"];
export type Rect = components["schemas"]["Rect"];
export type PsaCeiling = MeasurementResponse["psa"]["ceiling"];
export type ManualTarget = "outerCard" | "innerFrame";
export type ManualCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

type ApiErrorCode =
  | "INVALID_UPLOAD"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "IMAGE_UNREADABLE"
  | "CARD_NOT_DETECTED"
  | "MEASUREMENT_FAILED";

type ApiError = {
  code?: ApiErrorCode;
  message?: string;
  details?: Record<string, unknown>;
};

type ApiErrorBody = {
  error?: ApiError | string;
  detail?: string | { msg?: string }[];
  message?: string;
};
type CenteringError = ApiError | null;

export type CardIdentity = {
  name: string;
  setCode?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
};

export type CenteringWorkspaceProps = {
  gameSlug?: string | null;
  inventoryItemId?: string | null;
  preloadImageUrl?: string | null;
  intakeMode?: "single" | "frontBack";
  cardIdentity: CardIdentity;
};

export type WorkspaceStatus = "idle" | "uploading" | "processing" | "results" | "failure";

export type WorkspaceState = {
  status: WorkspaceStatus;
  result: MeasurementResponse | null;
  error: CenteringError;
};

type WorkspaceAction =
  | { type: "startUpload" }
  | { type: "startProcessing" }
  | { type: "success"; result: MeasurementResponse }
  | { type: "failure"; error: CenteringError }
  | { type: "reset" };

const INITIAL_STATE: WorkspaceState = {
  status: "idle",
  result: null,
  error: null,
};

const RETRYABLE_ERROR_CODES = new Set<ApiErrorCode>(["CARD_NOT_DETECTED", "IMAGE_UNREADABLE"]);
export const PRELOAD_FETCH_ERROR_MESSAGE = "Couldn't load saved scan. Upload a fresh image instead.";
const PROCESSING_STEPS = [
  "Validating image",
  "Finding card boundary",
  "Measuring border ratios",
  "Calculating PSA ceiling",
];

const TONE_STYLES: Record<
  "green" | "yellow" | "red",
  {
    stroke: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    softClass: string;
  }
> = {
  green: {
    stroke: "#2D9961",
    bgClass: "bg-gain-2",
    borderClass: "border-gain-2/50",
    textClass: "text-gain-2",
    softClass: "bg-[#DCF1E6]",
  },
  yellow: {
    stroke: "#E89512",
    bgClass: "bg-gold",
    borderClass: "border-gold/50",
    textClass: "text-gold",
    softClass: "bg-[#FCEBCF]",
  },
  red: {
    stroke: "#E04E4E",
    bgClass: "bg-loss-2",
    borderClass: "border-loss-2/50",
    textClass: "text-loss-2",
    softClass: "bg-[#FBE3E3]",
  },
};

export function centeringReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "startUpload":
      return { ...state, status: "uploading", error: null };
    case "startProcessing":
      return { ...state, status: "processing" };
    case "success":
      return { status: "results", result: action.result, error: null };
    case "failure":
      return { ...state, status: "failure", result: null, error: action.error ?? null };
    case "reset":
      return INITIAL_STATE;
    default:
      return state;
  }
}

export function psaTone(ceiling: PsaCeiling): keyof typeof TONE_STYLES {
  if (ceiling === "PSA_10") return "green";
  if (ceiling === "PSA_9" || ceiling === "PSA_8") return "yellow";
  return "red";
}

export function isManualCorrectionError(error: CenteringError | undefined) {
  return Boolean(error?.code && RETRYABLE_ERROR_CODES.has(error.code));
}

export function defaultManualOverlay(width: number, height: number): MeasurementOverlay {
  const outerMarginX = Math.round(width * 0.06);
  const outerMarginY = Math.round(height * 0.04);
  const outerCard = {
    x: outerMarginX,
    y: outerMarginY,
    width: Math.max(120, width - outerMarginX * 2),
    height: Math.max(180, height - outerMarginY * 2),
  };
  const innerMarginX = Math.round(outerCard.width * 0.09);
  const innerMarginY = Math.round(outerCard.height * 0.08);
  const innerFrame = {
    x: outerCard.x + innerMarginX,
    y: outerCard.y + innerMarginY,
    width: Math.max(80, outerCard.width - innerMarginX * 2),
    height: Math.max(120, outerCard.height - innerMarginY * 2),
  };

  return withGaps(outerCard, innerFrame);
}

export function withGaps(outerCard: Rect, innerFrame: Rect): MeasurementOverlay {
  return {
    coordinateSpace: "imagePixels",
    outerCard,
    innerFrame,
    gaps: {
      leftPx: Math.max(0, innerFrame.x - outerCard.x),
      rightPx: Math.max(0, outerCard.x + outerCard.width - (innerFrame.x + innerFrame.width)),
      topPx: Math.max(0, innerFrame.y - outerCard.y),
      bottomPx: Math.max(0, outerCard.y + outerCard.height - (innerFrame.y + innerFrame.height)),
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(rect: Rect, bounds: { width: number; height: number }) {
  const minWidth = 24;
  const minHeight = 24;
  const x = clamp(rect.x, 0, Math.max(0, bounds.width - minWidth));
  const y = clamp(rect.y, 0, Math.max(0, bounds.height - minHeight));
  const width = clamp(rect.width, minWidth, bounds.width - x);
  const height = clamp(rect.height, minHeight, bounds.height - y);
  return { x, y, width, height };
}

function rectFromCorner(rect: Rect, corner: ManualCorner, x: number, y: number, bounds: { width: number; height: number }) {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  if (corner === "topLeft") {
    return normalizeRect({ x, y, width: right - x, height: bottom - y }, bounds);
  }

  if (corner === "topRight") {
    return normalizeRect({ x: rect.x, y, width: x - rect.x, height: bottom - y }, bounds);
  }

  if (corner === "bottomLeft") {
    return normalizeRect({ x, y: rect.y, width: right - x, height: y - rect.y }, bounds);
  }

  return normalizeRect({ x: rect.x, y: rect.y, width: x - rect.x, height: y - rect.y }, bounds);
}

export function moveManualCorner({
  overlay,
  target,
  corner,
  x,
  y,
  bounds,
}: {
  overlay: MeasurementOverlay;
  target: ManualTarget;
  corner: ManualCorner;
  x: number;
  y: number;
  bounds: { width: number; height: number };
}) {
  const outerCard =
    target === "outerCard" ? rectFromCorner(overlay.outerCard, corner, x, y, bounds) : overlay.outerCard;
  const innerFrame =
    target === "innerFrame" ? rectFromCorner(overlay.innerFrame, corner, x, y, bounds) : overlay.innerFrame;
  return withGaps(outerCard, innerFrame);
}

export function buildMeasurementFormData({
  gameSlug,
  inventoryItemId,
  file,
  backFile,
  manualOverlay,
}: {
  gameSlug?: string | null;
  inventoryItemId?: string | null;
  file: File;
  backFile?: File | null;
  manualOverlay?: MeasurementOverlay | null;
}) {
  const formData = new FormData();
  if (gameSlug) {
    formData.set("game", gameSlug);
  }
  if (inventoryItemId) {
    formData.set("inventoryItemId", inventoryItemId);
  }
  formData.set("file", file);
  if (backFile) {
    formData.set("backFile", backFile);
  }

  if (manualOverlay) {
    formData.set("manual_adjustment", "true");
    formData.set("corrected_overlay", JSON.stringify(manualOverlay));
  }

  return formData;
}

export function buildResultViewModel(result: MeasurementResponse) {
  return {
    tone: psaTone(result.psa.ceiling),
    ceilingLabel: result.psa.label,
    leftRight: `${result.centering.leftRight.leftPercent.toFixed(2)} / ${result.centering.leftRight.rightPercent.toFixed(2)}`,
    topBottom: `${result.centering.topBottom.topPercent.toFixed(2)} / ${result.centering.topBottom.bottomPercent.toFixed(2)}`,
    worstAxisLabel: result.centering.worstAxis === "leftRight" ? "Left/right" : "Top/bottom",
    worstAxisValue: `${result.centering.worstAxisMaxPercent.toFixed(2)}%`,
    thresholds: result.psa.thresholds.map((threshold) => ({
      ceiling: threshold.ceiling,
      label: threshold.label,
      ratioLabel: threshold.ratioLabel,
      maxMajorPercent: threshold.maxMajorPercent,
    })),
  };
}

export function reportFileName(cardName: string) {
  const slug = cardName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "centering"}-report.png`;
}

export async function downloadReportElement({
  element,
  filename,
  toPngImpl = toPng,
}: {
  element: HTMLElement;
  filename: string;
  toPngImpl?: typeof toPng;
}) {
  const dataUrl = await toPngImpl(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#FFF5E4",
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (
    value === "INVALID_UPLOAD" ||
    value === "FILE_TOO_LARGE" ||
    value === "UNSUPPORTED_MEDIA_TYPE" ||
    value === "IMAGE_UNREADABLE" ||
    value === "CARD_NOT_DETECTED" ||
    value === "MEASUREMENT_FAILED"
  );
}

function detailMessage(detail: ApiErrorBody["detail"]) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((entry) => entry?.msg).filter(Boolean).join(" ");
  }
  return null;
}

function readErrorBody(body: unknown): CenteringError {
  if (!body || typeof body !== "object") return null;
  const payload = body as ApiErrorBody;
  const error = payload.error;
  if (error && typeof error === "object") {
    return {
      code: isApiErrorCode(error.code) ? error.code : "MEASUREMENT_FAILED",
      message: error.message || "Measurement failed.",
      details: error.details,
    };
  }
  if (typeof error === "string" && error.trim()) {
    return { code: "MEASUREMENT_FAILED", message: error.trim() };
  }
  const message = detailMessage(payload.detail) ?? payload.message;
  return message ? { code: "MEASUREMENT_FAILED", message } : null;
}

function readErrorText(text: string | null): CenteringError {
  const message = text?.trim();
  return message ? { code: "MEASUREMENT_FAILED", message } : null;
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  return ".jpg";
}

export function preloadedImageFileName(imageUrl: string, contentType: string) {
  const extension = extensionForContentType(contentType);

  try {
    const url = new URL(imageUrl);
    const name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    if (/\.(jpe?g|png|webp)$/i.test(name)) return name;
    if (name) return `${name}${extension}`;
  } catch {
    // Fall through to the stable default for relative or malformed URLs.
  }

  return `saved-card-scan${extension}`;
}

export async function fetchPreloadedImageFile({
  imageUrl,
  fetchImpl = fetch,
}: {
  imageUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(imageUrl);
  if (!response.ok) {
    throw new Error(`Could not load saved scan: ${response.status}`);
  }

  const headerContentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  const blob = await response.blob();
  const contentType = headerContentType || blob.type || "image/jpeg";

  return new File([blob], preloadedImageFileName(imageUrl, contentType), { type: contentType });
}

export async function submitMeasurementRequest({
  gameSlug,
  inventoryItemId,
  file,
  backFile,
  manualOverlay,
  fetchImpl = fetch,
}: {
  gameSlug?: string | null;
  inventoryItemId?: string | null;
  file: File;
  backFile?: File | null;
  manualOverlay?: MeasurementOverlay | null;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; result: MeasurementResponse } | { ok: false; error: CenteringError }> {
  const response = await fetchImpl("/api/centering/measure", {
    method: "POST",
    body: buildMeasurementFormData({
      gameSlug,
      inventoryItemId,
      file,
      backFile,
      manualOverlay,
    }),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      error: { code: "MEASUREMENT_FAILED", message: "Could not reach the centering service." },
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;
  const text = isJson ? null : await response.text().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      error: readErrorBody(body) ?? readErrorText(text) ?? { code: "MEASUREMENT_FAILED", message: "Measurement failed." },
    };
  }

  return { ok: true, result: body as MeasurementResponse };
}

export async function measurePreloadedImage({
  imageUrl,
  gameSlug,
  inventoryItemId,
  dispatchAction,
  onFile,
  fetchImpl = fetch,
  wait = delay,
}: {
  imageUrl: string;
  gameSlug?: string | null;
  inventoryItemId?: string | null;
  dispatchAction: (action: WorkspaceAction) => void;
  onFile: (file: File) => void;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<unknown>;
}): Promise<
  | { ok: true; file: File; result: MeasurementResponse }
  | { ok: false; file?: File; error: CenteringError; preloadError?: string }
> {
  dispatchAction({ type: "startUpload" });

  let file: File;
  try {
    file = await fetchPreloadedImageFile({ imageUrl, fetchImpl });
  } catch {
    dispatchAction({ type: "reset" });
    return {
      ok: false,
      error: null,
      preloadError: PRELOAD_FETCH_ERROR_MESSAGE,
    };
  }

  onFile(file);
  await wait(250);
  dispatchAction({ type: "startProcessing" });

  const outcome = await submitMeasurementRequest({
    gameSlug,
    inventoryItemId,
    file,
    fetchImpl,
  });

  if (!outcome.ok) {
    dispatchAction({ type: "failure", error: outcome.error });
    return {
      ok: false,
      file,
      error: outcome.error,
    };
  }

  dispatchAction({ type: "success", result: outcome.result });
  return {
    ok: true,
    file,
    result: outcome.result,
  };
}

function StatusPanel({ status }: { status: WorkspaceStatus }) {
  const activeIndex = status === "uploading" ? 0 : status === "processing" ? 2 : -1;

  return (
    <div className="admin-card p-5">
      <div className="flex items-center gap-3">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink/30 border-t-coral" />
        <div>
          <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-coral">
            {status === "uploading" ? "Uploading" : "Processing"}
          </div>
          <div className="mt-1 text-sm text-ink-2">Expected processing time is 1-3 seconds.</div>
        </div>
      </div>
      <ol className="mt-5 grid gap-2">
        {PROCESSING_STEPS.map((step, index) => (
          <li
            key={step}
            className={`flex items-center gap-3 rounded-md border-[1.5px] px-3 py-2 text-sm ${
              index <= activeIndex
                ? "border-coral bg-bg-3 text-ink"
                : "border-ink/20 bg-bg-2 text-ink-3"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${index <= activeIndex ? "bg-coral" : "bg-ink-3"}`}
              aria-hidden="true"
            />
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

function UploadZone({
  getRootProps,
  getInputProps,
  isDragActive,
  imageSrc,
}: {
  getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
  getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
  isDragActive: boolean;
  imageSrc: string | null;
}) {
  return (
    <div
      {...getRootProps()}
      className={`flex min-h-[560px] cursor-pointer flex-col items-center justify-center rounded-c-md border-[1.5px] border-dashed p-8 text-center outline-none transition-colors ${
        isDragActive ? "border-coral bg-bg-3" : "border-ink/40 bg-bg-2 hover:border-coral hover:bg-bg-3"
      }`}
    >
      <input {...getInputProps()} />
      {imageSrc ? (
        <div className="w-full">
          <div className="mb-4 font-mono-2 text-xs font-bold uppercase tracking-wider text-ink-2">Ready to measure</div>
          <div className="mx-auto flex aspect-[5/7] max-h-[420px] max-w-[300px] items-center justify-center rounded-c-sm border-[1.5px] border-ink bg-bg-3">
            <svg viewBox="0 0 100 140" role="img" aria-label="Selected card image preview" className="h-full w-full">
              <image href={imageSrc} x="0" y="0" width="100" height="140" preserveAspectRatio="xMidYMid meet" />
            </svg>
          </div>
        </div>
      ) : (
        <div className="max-w-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-c-sm border-[1.5px] border-coral bg-bg-3 text-coral">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none">
              <path
                d="M12 16V4m0 0 4 4m-4-4-4 4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
          <h2 className="font-grotesk text-2xl font-bold text-ink">Upload card image</h2>
          <p className="mt-3 text-sm leading-6 text-ink-2">
            Drop, paste, or browse for a JPEG, PNG, or WEBP image. The browser sends it through the
            authenticated OWL proxy, never directly to the CV service.
          </p>
          <div className="admin-btn admin-btn-primary mt-6">Browse image</div>
        </div>
      )}
    </div>
  );
}

type DropzoneBindings = {
  getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
  getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
  isDragActive: boolean;
};

function SideUploadZone({
  label,
  title,
  actionLabel,
  imageSrc,
  fileName,
  dropzone,
}: {
  label: string;
  title: string;
  actionLabel: string;
  imageSrc: string | null;
  fileName: string | null;
  dropzone: DropzoneBindings;
}) {
  return (
    <div
      {...dropzone.getRootProps()}
      className={`flex min-h-[340px] cursor-pointer flex-col justify-between rounded-c-md border-[1.5px] border-dashed p-5 outline-none transition-colors ${
        dropzone.isDragActive ? "border-coral bg-bg-3" : "border-ink/40 bg-bg-2 hover:border-coral hover:bg-bg-3"
      }`}
    >
      <input {...dropzone.getInputProps()} />
      <div>
        <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-coral">{label}</div>
        <h3 className="mt-2 font-grotesk text-2xl font-bold text-ink">{title}</h3>
      </div>

      {imageSrc ? (
        <div className="my-5">
          <div className="mx-auto flex aspect-[5/7] max-h-[230px] max-w-[170px] items-center justify-center overflow-hidden rounded-c-sm border-[1.5px] border-ink bg-bg-3">
            <svg viewBox="0 0 100 140" role="img" aria-label={`${label} selected card image preview`} className="h-full w-full">
              <image href={imageSrc} x="0" y="0" width="100" height="140" preserveAspectRatio="xMidYMid meet" />
            </svg>
          </div>
          {fileName && (
            <div className="mt-3 truncate text-center font-mono-2 text-xs font-semibold text-ink-2">{fileName}</div>
          )}
        </div>
      ) : (
        <div className="my-8 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-c-sm border-[1.5px] border-coral bg-bg-3 text-coral">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none">
              <path
                d="M12 16V4m0 0 4 4m-4-4-4 4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      )}

      <div className="admin-btn admin-btn-ghost w-full justify-center">{actionLabel}</div>
    </div>
  );
}

function FrontBackUploadPanel({
  frontDropzone,
  backDropzone,
  frontImageSrc,
  backImageSrc,
  frontFileName,
  backFileName,
  onMeasure,
  canMeasure,
}: {
  frontDropzone: DropzoneBindings;
  backDropzone: DropzoneBindings;
  frontImageSrc: string | null;
  backImageSrc: string | null;
  frontFileName: string | null;
  backFileName: string | null;
  onMeasure: () => void;
  canMeasure: boolean;
}) {
  return (
    <div className="admin-card p-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <SideUploadZone
          label="Front"
          title="Front scan"
          actionLabel={frontImageSrc ? "Replace front" : "Upload front"}
          imageSrc={frontImageSrc}
          fileName={frontFileName}
          dropzone={frontDropzone}
        />
        <SideUploadZone
          label="Back"
          title="Back scan"
          actionLabel={backImageSrc ? "Replace back" : "Upload back"}
          imageSrc={backImageSrc}
          fileName={backFileName}
          dropzone={backDropzone}
        />
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
          Upload both sides before measuring.
        </div>
        <button
          type="button"
          onClick={onMeasure}
          disabled={!canMeasure}
          className="admin-btn admin-btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          Measure card
        </button>
      </div>
    </div>
  );
}

function PreloadedImagePanel({
  imageSrc,
  onMeasure,
  onUploadDifferent,
}: {
  imageSrc: string;
  onMeasure: () => void;
  onUploadDifferent: () => void;
}) {
  return (
    <div className="admin-card flex min-h-[560px] flex-col items-center justify-center p-8 text-center">
      <div className="w-full">
        <div className="mb-4 font-mono-2 text-xs font-bold uppercase tracking-wider text-ink-2">Ready to measure</div>
        <div className="mx-auto flex aspect-[5/7] max-h-[420px] max-w-[300px] items-center justify-center rounded-c-sm border-[1.5px] border-ink bg-bg-3">
          <svg viewBox="0 0 100 140" role="img" aria-label="Saved card image preview" className="h-full w-full">
            <image href={imageSrc} x="0" y="0" width="100" height="140" preserveAspectRatio="xMidYMid meet" />
          </svg>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onMeasure} className="admin-btn admin-btn-primary">
            Measure this card
          </button>
          <button type="button" onClick={onUploadDifferent} className="admin-btn admin-btn-ghost">
            Upload a different image
          </button>
        </div>
      </div>
    </div>
  );
}

function OverlaySvg({
  imageSrc,
  overlay,
  imageSize,
  tone,
}: {
  imageSrc: string | null;
  overlay: MeasurementOverlay;
  imageSize: { width: number; height: number };
  tone: keyof typeof TONE_STYLES;
}) {
  const color = TONE_STYLES[tone].stroke;
  const { outerCard, innerFrame } = overlay;

  return (
    <svg
      viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
      role="img"
      aria-label="Measured card centering overlay"
      className="h-full max-h-[720px] w-full rounded-c-sm bg-bg-3"
    >
      {imageSrc && (
        <image
          href={imageSrc}
          x="0"
          y="0"
          width={imageSize.width}
          height={imageSize.height}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <defs>
        <marker id="centering-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="4" refY="4">
          <path d="M0 0 8 4 0 8Z" fill={color} />
        </marker>
      </defs>
      <rect
        x={outerCard.x}
        y={outerCard.y}
        width={outerCard.width}
        height={outerCard.height}
        fill="none"
        stroke={color}
        strokeWidth="4"
      />
      <rect
        x={innerFrame.x}
        y={innerFrame.y}
        width={innerFrame.width}
        height={innerFrame.height}
        fill="rgba(26,15,8,0.06)"
        stroke="#1A0F08"
        strokeDasharray="14 10"
        strokeWidth="3"
      />
      <line
        x1={outerCard.x}
        y1={innerFrame.y + innerFrame.height / 2}
        x2={innerFrame.x}
        y2={innerFrame.y + innerFrame.height / 2}
        stroke={color}
        strokeWidth="3"
        markerEnd="url(#centering-arrow)"
      />
      <line
        x1={outerCard.x + outerCard.width}
        y1={innerFrame.y + innerFrame.height / 2}
        x2={innerFrame.x + innerFrame.width}
        y2={innerFrame.y + innerFrame.height / 2}
        stroke={color}
        strokeWidth="3"
        markerEnd="url(#centering-arrow)"
      />
      <line
        x1={innerFrame.x + innerFrame.width / 2}
        y1={outerCard.y}
        x2={innerFrame.x + innerFrame.width / 2}
        y2={innerFrame.y}
        stroke={color}
        strokeWidth="3"
        markerEnd="url(#centering-arrow)"
      />
      <line
        x1={innerFrame.x + innerFrame.width / 2}
        y1={outerCard.y + outerCard.height}
        x2={innerFrame.x + innerFrame.width / 2}
        y2={innerFrame.y + innerFrame.height}
        stroke={color}
        strokeWidth="3"
        markerEnd="url(#centering-arrow)"
      />
    </svg>
  );
}

function ResultPanel({
  result,
  imageSrc,
  cardIdentity,
  onDownload,
  onReset,
  reportRef,
}: {
  result: MeasurementResponse;
  imageSrc: string | null;
  cardIdentity: CardIdentity;
  onDownload: () => void;
  onReset: () => void;
  reportRef: RefObject<HTMLDivElement>;
}) {
  const viewModel = buildResultViewModel(result);
  const tone = TONE_STYLES[viewModel.tone];
  const imageSize = {
    width: result.image.widthPx,
    height: result.image.heightPx,
  };

  return (
    <div ref={reportRef} className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <section className="admin-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-coral">Measured Overlay</div>
            <h2 className="mt-1 font-grotesk text-xl font-bold text-ink">{cardIdentity.name}</h2>
          </div>
          {cardIdentity.rarity && (
            <span className="inline-flex items-center rounded-c-pill border-[1.2px] border-coral bg-bg-3 px-3 py-1 font-mono-2 text-xs font-bold uppercase tracking-wider text-coral">
              {cardIdentity.rarity}
            </span>
          )}
        </div>
        <div className="admin-card-inset flex min-h-[520px] items-center justify-center p-3">
          <OverlaySvg imageSrc={imageSrc} overlay={result.overlay} imageSize={imageSize} tone={viewModel.tone} />
        </div>
      </section>

      <section className="admin-card p-5">
        <div className={`inline-flex rounded-c-sm border-[1.5px] px-3 py-2 font-mono-2 text-xs font-bold uppercase tracking-wider ${tone.borderClass} ${tone.softClass} ${tone.textClass}`}>
          {viewModel.ceilingLabel}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <RatioBox label="Left / Right" value={viewModel.leftRight} tone={viewModel.tone} />
          <RatioBox label="Top / Bottom" value={viewModel.topBottom} tone={viewModel.tone} />
        </div>
        <div className={`mt-4 rounded-c-sm border-[1.5px] p-4 ${tone.borderClass} ${tone.softClass}`}>
          <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-ink-2">Worst axis</div>
          <div className={`mt-2 text-lg font-bold ${tone.textClass}`}>
            {viewModel.worstAxisLabel} at {viewModel.worstAxisValue}
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-c-sm border-[1.5px] border-ink">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg-3 font-mono-2 text-xs uppercase tracking-wider text-ink-2">
              <tr>
                <th className="px-3 py-2 font-semibold">Ceiling</th>
                <th className="px-3 py-2 font-semibold">Ratio</th>
                <th className="px-3 py-2 text-right font-semibold">Max major</th>
              </tr>
            </thead>
            <tbody>
              {viewModel.thresholds.map((threshold) => (
                <tr key={threshold.ceiling} className="border-t border-bg-3">
                  <td className="px-3 py-2 font-semibold text-ink">{threshold.label}</td>
                  <td className="px-3 py-2 font-mono-2 text-ink-2">{threshold.ratioLabel}</td>
                  <td className="px-3 py-2 text-right font-mono-2 text-ink">{threshold.maxMajorPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={onDownload} className="admin-btn admin-btn-primary">
            Download report
          </button>
          <button type="button" onClick={onReset} className="admin-btn admin-btn-ghost">
            Measure another
          </button>
        </div>
      </section>
    </div>
  );
}

function RatioBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE_STYLES;
}) {
  const style = TONE_STYLES[tone];
  return (
    <div className={`rounded-c-sm border-[1.5px] p-4 ${style.borderClass} ${style.softClass}`}>
      <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-ink-2">{label}</div>
      <div className={`mt-2 font-mono-2 text-2xl font-bold ${style.textClass}`}>{value}</div>
    </div>
  );
}

function ManualOverlayEditor({
  imageSrc,
  imageSize,
  overlay,
  onChange,
}: {
  imageSrc: string | null;
  imageSize: { width: number; height: number };
  overlay: MeasurementOverlay;
  onChange: (overlay: MeasurementOverlay) => void;
}) {
  const [activeHandle, setActiveHandle] = useState<{ target: ManualTarget; corner: ManualCorner } | null>(null);

  const pointFromEvent = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * imageSize.width;
      const y = ((event.clientY - rect.top) / rect.height) * imageSize.height;
      return {
        x: clamp(x, 0, imageSize.width),
        y: clamp(y, 0, imageSize.height),
      };
    },
    [imageSize.height, imageSize.width]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!activeHandle) return;
      const point = pointFromEvent(event);
      onChange(
        moveManualCorner({
          overlay,
          target: activeHandle.target,
          corner: activeHandle.corner,
          x: point.x,
          y: point.y,
          bounds: imageSize,
        })
      );
    },
    [activeHandle, imageSize, onChange, overlay, pointFromEvent]
  );

  return (
    <svg
      viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
      className="h-full max-h-[620px] w-full rounded-c-sm bg-bg-3"
      onPointerMove={onPointerMove}
      onPointerUp={() => setActiveHandle(null)}
      onPointerLeave={() => setActiveHandle(null)}
      role="img"
      aria-label="Manual centering border adjustment"
    >
      {imageSrc && (
        <image href={imageSrc} width={imageSize.width} height={imageSize.height} preserveAspectRatio="xMidYMid meet" />
      )}
      <EditableRect
        rect={overlay.outerCard}
        target="outerCard"
        stroke="#E89512"
        onHandlePointerDown={(target, corner) => setActiveHandle({ target, corner })}
      />
      <EditableRect
        rect={overlay.innerFrame}
        target="innerFrame"
        stroke="#2D9961"
        onHandlePointerDown={(target, corner) => setActiveHandle({ target, corner })}
      />
    </svg>
  );
}

function EditableRect({
  rect,
  target,
  stroke,
  onHandlePointerDown,
}: {
  rect: Rect;
  target: ManualTarget;
  stroke: string;
  onHandlePointerDown: (target: ManualTarget, corner: ManualCorner) => void;
}) {
  const handles: { corner: ManualCorner; x: number; y: number }[] = [
    { corner: "topLeft", x: rect.x, y: rect.y },
    { corner: "topRight", x: rect.x + rect.width, y: rect.y },
    { corner: "bottomLeft", x: rect.x, y: rect.y + rect.height },
    { corner: "bottomRight", x: rect.x + rect.width, y: rect.y + rect.height },
  ];

  return (
    <g>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="rgba(26,15,8,0.06)"
        stroke={stroke}
        strokeWidth="4"
      />
      {handles.map((handle) => (
        <circle
          key={`${target}-${handle.corner}`}
          cx={handle.x}
          cy={handle.y}
          r="12"
          fill={stroke}
          stroke="#1A0F08"
          strokeWidth="4"
          className="cursor-move"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onHandlePointerDown(target, handle.corner);
          }}
        />
      ))}
    </g>
  );
}

function FailurePanel({
  error,
  imageSrc,
  imageSize,
  manualOverlay,
  onManualOverlayChange,
  onRetry,
  onReset,
  canRetry,
}: {
  error: CenteringError;
  imageSrc: string | null;
  imageSize: { width: number; height: number };
  manualOverlay: MeasurementOverlay;
  onManualOverlayChange: (overlay: MeasurementOverlay) => void;
  onRetry: () => void;
  onReset: () => void;
  canRetry: boolean;
}) {
  const showManualCorrection = isManualCorrectionError(error);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <section className="rounded-c-md border-[1.5px] border-loss-2 bg-[#FBE3E3] p-4">
        <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-loss-2">{error?.code ?? "MEASUREMENT_FAILED"}</div>
        <h2 className="mt-2 font-grotesk text-2xl font-bold text-ink">{error?.message ?? "Measurement failed."}</h2>
        {showManualCorrection ? (
          <p className="mt-2 text-sm leading-6 text-ink-2">
            Drag the outer card and inner frame corners, then re-measure with those corrections.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-ink-2">
            Try another image or return to the upload state.
          </p>
        )}
      </section>

      <section className="admin-card p-4 lg:col-span-2">
        {showManualCorrection ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="admin-card-inset flex min-h-[520px] items-center justify-center p-3">
              <ManualOverlayEditor
                imageSrc={imageSrc}
                imageSize={imageSize}
                overlay={manualOverlay}
                onChange={onManualOverlayChange}
              />
            </div>
            <div className="space-y-4">
              <div className="admin-card-inset p-4">
                <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-ink-2">Manual correction</div>
                <div className="mt-3 grid grid-cols-2 gap-3 font-mono-2 text-xs text-ink">
                  <div>Outer X {Math.round(manualOverlay.outerCard.x)}</div>
                  <div>Outer Y {Math.round(manualOverlay.outerCard.y)}</div>
                  <div>Inner X {Math.round(manualOverlay.innerFrame.x)}</div>
                  <div>Inner Y {Math.round(manualOverlay.innerFrame.y)}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onRetry}
                disabled={!canRetry}
                className="admin-btn admin-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                Re-measure with my corrections
              </button>
              <button
                type="button"
                onClick={onReset}
                className="admin-btn admin-btn-ghost w-full justify-center"
              >
                Measure another
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={onReset} className="admin-btn admin-btn-ghost">
            Measure another
          </button>
        )}
      </section>
    </div>
  );
}

export default function CenteringWorkspace({
  gameSlug = null,
  inventoryItemId,
  preloadImageUrl = null,
  intakeMode = "single",
  cardIdentity,
}: CenteringWorkspaceProps) {
  const [state, dispatch] = useReducer(centeringReducer, INITIAL_STATE);
  const preloadImageSrc = inventoryItemId ? preloadImageUrl : null;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBackFile, setSelectedBackFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [showUploadZone, setShowUploadZone] = useState(!preloadImageSrc);
  const [preloadFetchError, setPreloadFetchError] = useState<string | null>(null);
  const [manualOverlay, setManualOverlay] = useState<MeasurementOverlay>(() => defaultManualOverlay(1024, 1428));
  const [imageSize, setImageSize] = useState({ width: 1024, height: 1428 });
  const reportRef = useRef<HTMLDivElement>(null);
  const imageSrc = previewUrl ?? preloadImageSrc ?? null;
  const showPreloadedPanel = Boolean(preloadImageSrc && !showUploadZone && !selectedFile);
  const usesFrontBackIntake = intakeMode === "frontBack" && !preloadImageSrc;

  useEffect(() => {
    if (!selectedFile) return;
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedBackFile) return;
    const objectUrl = URL.createObjectURL(selectedBackFile);
    setBackPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedBackFile]);

  useEffect(() => {
    if (!imageSrc) return;
    const image = new Image();
    image.onload = () => {
      const nextSize = {
        width: image.naturalWidth || 1024,
        height: image.naturalHeight || 1428,
      };
      setImageSize(nextSize);
      setManualOverlay(defaultManualOverlay(nextSize.width, nextSize.height));
    };
    image.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    setShowUploadZone(!preloadImageSrc);
    setPreloadFetchError(null);
  }, [preloadImageSrc]);

  const submitMeasurement = useCallback(
    async (file: File, overlay?: MeasurementOverlay | null, backFile?: File | null) => {
      dispatch({ type: "startUpload" });
      await delay(250);
      dispatch({ type: "startProcessing" });

      const outcome = await submitMeasurementRequest({
        gameSlug,
        inventoryItemId,
        file,
        backFile,
        manualOverlay: overlay,
      });

      if (!outcome.ok) {
        dispatch({ type: "failure", error: outcome.error });
        return;
      }

      dispatch({ type: "success", result: outcome.result });
    },
    [gameSlug, inventoryItemId]
  );

  const measureFile = useCallback(
    (file: File) => {
      setPreloadFetchError(null);
      setSelectedFile(file);
      void submitMeasurement(file);
    },
    [submitMeasurement]
  );

  const selectFrontFile = useCallback((file: File) => {
    setPreloadFetchError(null);
    setSelectedFile(file);
  }, []);

  const selectBackFile = useCallback((file: File) => {
    setPreloadFetchError(null);
    setSelectedBackFile(file);
  }, []);

  const clearSelectedFiles = useCallback(() => {
    setSelectedFile(null);
    setSelectedBackFile(null);
    setPreviewUrl(null);
    setBackPreviewUrl(null);
  }, []);

  const measureSelectedCardFiles = useCallback(() => {
    if (selectedFile && selectedBackFile) {
      void submitMeasurement(selectedFile, null, selectedBackFile);
    }
  }, [selectedBackFile, selectedFile, submitMeasurement]);

  const measurePreloadedFile = useCallback(() => {
    if (!preloadImageSrc) return;

    setPreloadFetchError(null);
    void measurePreloadedImage({
      imageUrl: preloadImageSrc,
      inventoryItemId,
      gameSlug,
      dispatchAction: dispatch,
      onFile: setSelectedFile,
    }).then((outcome) => {
      if (!outcome.ok && outcome.preloadError) {
        setPreloadFetchError(outcome.preloadError);
        setShowUploadZone(true);
      }
    });
  }, [gameSlug, inventoryItemId, preloadImageSrc]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const [file] = acceptedFiles;
      if (file) measureFile(file);
    },
    [measureFile]
  );

  const onFrontDrop = useCallback(
    (acceptedFiles: File[]) => {
      const [file] = acceptedFiles;
      if (file) selectFrontFile(file);
    },
    [selectFrontFile]
  );

  const onBackDrop = useCallback(
    (acceptedFiles: File[]) => {
      const [file] = acceptedFiles;
      if (file) selectBackFile(file);
    },
    [selectBackFile]
  );

  const dropzone = useDropzone({
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    multiple: false,
    onDrop,
  });

  const frontDropzone = useDropzone({
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    multiple: false,
    onDrop: onFrontDrop,
  });

  const backDropzone = useDropzone({
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    multiple: false,
    onDrop: onBackDrop,
  });

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith("image/"));
      if (file) {
        event.preventDefault();
        if (usesFrontBackIntake) {
          if (selectedFile) {
            selectBackFile(file);
          } else {
            selectFrontFile(file);
          }
        } else {
          measureFile(file);
        }
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [measureFile, selectBackFile, selectFrontFile, selectedFile, usesFrontBackIntake]);

  const canRetryWithCorrections = Boolean(selectedFile);
  const headerMeta = useMemo(
    () =>
      [cardIdentity.setCode, cardIdentity.cardNumber, cardIdentity.rarity]
        .filter((value): value is string => Boolean(value))
        .join(" / "),
    [cardIdentity.cardNumber, cardIdentity.rarity, cardIdentity.setCode]
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-mono-2 text-xs font-bold uppercase tracking-wider text-coral">Owl Lens</div>
          <h2 className="mt-2 font-grotesk text-3xl font-bold text-ink">{cardIdentity.name}</h2>
          {headerMeta && <div className="mt-2 font-mono-2 text-xs font-semibold uppercase tracking-wider text-ink-2">{headerMeta}</div>}
        </div>
        <div className="admin-card px-3 py-2 font-mono-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
          {state.status}
        </div>
      </div>

      {state.status === "idle" && (
        <>
          {preloadFetchError && (
            <div className="rounded-c-sm border-[1.5px] border-loss-2 bg-[#FBE3E3] px-4 py-3 text-sm font-semibold text-ink">
              {preloadFetchError}
            </div>
          )}
          {showPreloadedPanel && preloadImageSrc ? (
            <PreloadedImagePanel
              imageSrc={preloadImageSrc}
              onMeasure={measurePreloadedFile}
              onUploadDifferent={() => {
                setPreloadFetchError(null);
                setShowUploadZone(true);
              }}
            />
          ) : usesFrontBackIntake ? (
            <FrontBackUploadPanel
              frontDropzone={frontDropzone}
              backDropzone={backDropzone}
              frontImageSrc={previewUrl}
              backImageSrc={backPreviewUrl}
              frontFileName={selectedFile?.name ?? null}
              backFileName={selectedBackFile?.name ?? null}
              canMeasure={Boolean(selectedFile && selectedBackFile)}
              onMeasure={measureSelectedCardFiles}
            />
          ) : (
            <UploadZone
              getRootProps={dropzone.getRootProps}
              getInputProps={dropzone.getInputProps}
              isDragActive={dropzone.isDragActive}
              imageSrc={selectedFile ? previewUrl : null}
            />
          )}
        </>
      )}

      {(state.status === "uploading" || state.status === "processing") && <StatusPanel status={state.status} />}

      {state.status === "results" && state.result && (
        <ResultPanel
          result={state.result}
          imageSrc={imageSrc}
          cardIdentity={cardIdentity}
          reportRef={reportRef}
          onDownload={() => {
            if (reportRef.current) {
              void downloadReportElement({
                element: reportRef.current,
                filename: reportFileName(cardIdentity.name),
              });
            }
          }}
          onReset={() => {
            clearSelectedFiles();
            dispatch({ type: "reset" });
          }}
        />
      )}

      {state.status === "failure" && (
        <FailurePanel
          error={state.error}
          imageSrc={imageSrc}
          imageSize={imageSize}
          manualOverlay={manualOverlay}
          onManualOverlayChange={setManualOverlay}
          canRetry={canRetryWithCorrections}
          onRetry={() => {
            if (selectedFile) void submitMeasurement(selectedFile, manualOverlay, selectedBackFile);
          }}
          onReset={() => {
            clearSelectedFiles();
            dispatch({ type: "reset" });
          }}
        />
      )}
    </section>
  );
}
