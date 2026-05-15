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

type ApiErrorBody = {
  error?: {
    code?: ApiErrorCode;
    message?: string;
    details?: Record<string, unknown>;
  };
};
type CenteringError = ApiErrorBody["error"] | null;

export type CardIdentity = {
  name: string;
  setCode?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
};

export type CenteringWorkspaceProps = {
  inventoryItemId: string;
  preloadImageUrl?: string | null;
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
    stroke: "#00D68F",
    bgClass: "bg-gain",
    borderClass: "border-gain/40",
    textClass: "text-gain",
    softClass: "bg-gain/10",
  },
  yellow: {
    stroke: "#E8A020",
    bgClass: "bg-owl",
    borderClass: "border-owl/40",
    textClass: "text-owl",
    softClass: "bg-owl/10",
  },
  red: {
    stroke: "#FF4560",
    bgClass: "bg-loss",
    borderClass: "border-loss/40",
    textClass: "text-loss",
    softClass: "bg-loss/10",
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
  inventoryItemId,
  file,
  manualOverlay,
}: {
  inventoryItemId: string;
  file: File;
  manualOverlay?: MeasurementOverlay | null;
}) {
  const formData = new FormData();
  formData.set("inventoryItemId", inventoryItemId);
  formData.set("file", file);

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
    backgroundColor: "#03050D",
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

function readErrorBody(body: unknown): CenteringError {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as ApiErrorBody).error;
  return error && typeof error === "object" ? error : null;
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
  inventoryItemId,
  file,
  manualOverlay,
  fetchImpl = fetch,
}: {
  inventoryItemId: string;
  file: File;
  manualOverlay?: MeasurementOverlay | null;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; result: MeasurementResponse } | { ok: false; error: CenteringError }> {
  const response = await fetchImpl("/api/centering/measure", {
    method: "POST",
    body: buildMeasurementFormData({
      inventoryItemId,
      file,
      manualOverlay,
    }),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      error: { code: "MEASUREMENT_FAILED", message: "Could not reach the centering service." },
    };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      error: readErrorBody(body) ?? { code: "MEASUREMENT_FAILED", message: "Measurement failed." },
    };
  }

  return { ok: true, result: body as MeasurementResponse };
}

export async function measurePreloadedImage({
  imageUrl,
  inventoryItemId,
  dispatchAction,
  onFile,
  fetchImpl = fetch,
  wait = delay,
}: {
  imageUrl: string;
  inventoryItemId: string;
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
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border-2 border-t-owl" />
        <div>
          <div className="font-mono text-xs font-bold uppercase text-owl">
            {status === "uploading" ? "Uploading" : "Processing"}
          </div>
          <div className="mt-1 text-sm text-text-2">Expected processing time is 1-3 seconds.</div>
        </div>
      </div>
      <ol className="mt-5 grid gap-2">
        {PROCESSING_STEPS.map((step, index) => (
          <li
            key={step}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
              index <= activeIndex
                ? "border-owl/40 bg-owl/10 text-text"
                : "border-border bg-deep text-text-2"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${index <= activeIndex ? "bg-owl" : "bg-text-3"}`}
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
      className={`flex min-h-[560px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center outline-none transition-colors ${
        isDragActive ? "border-owl bg-owl/10" : "border-border-2 bg-surface hover:border-owl/50 hover:bg-surf2"
      }`}
    >
      <input {...getInputProps()} />
      {imageSrc ? (
        <div className="w-full">
          <div className="mb-4 font-mono text-xs font-bold uppercase text-text-2">Ready to measure</div>
          <div className="mx-auto flex aspect-[5/7] max-h-[420px] max-w-[300px] items-center justify-center rounded-md border border-border bg-deep">
            <svg viewBox="0 0 100 140" role="img" aria-label="Selected card image preview" className="h-full w-full">
              <image href={imageSrc} x="0" y="0" width="100" height="140" preserveAspectRatio="xMidYMid meet" />
            </svg>
          </div>
        </div>
      ) : (
        <div className="max-w-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-owl/40 bg-owl/10 text-owl">
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
          <h2 className="text-2xl font-bold text-text">Upload a front scan</h2>
          <p className="mt-3 text-sm leading-6 text-text-2">
            Drop, paste, or browse for a JPEG, PNG, or WEBP image. The browser sends it through the
            authenticated OWL proxy, never directly to the CV service.
          </p>
          <div className="mt-6 inline-flex rounded-md border border-owl/40 bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase text-void">
            Browse scan
          </div>
        </div>
      )}
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
    <div className="flex min-h-[560px] flex-col items-center justify-center rounded-lg border border-border bg-surface p-8 text-center">
      <div className="w-full">
        <div className="mb-4 font-mono text-xs font-bold uppercase text-text-2">Ready to measure</div>
        <div className="mx-auto flex aspect-[5/7] max-h-[420px] max-w-[300px] items-center justify-center rounded-md border border-border bg-deep">
          <svg viewBox="0 0 100 140" role="img" aria-label="Saved card image preview" className="h-full w-full">
            <image href={imageSrc} x="0" y="0" width="100" height="140" preserveAspectRatio="xMidYMid meet" />
          </svg>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onMeasure}
            className="rounded-md border border-owl/40 bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase text-void transition-colors hover:bg-owl-light"
          >
            Measure this card
          </button>
          <button
            type="button"
            onClick={onUploadDifferent}
            className="rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase text-text transition-colors hover:border-border-2 hover:bg-surf2"
          >
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
      className="h-full max-h-[720px] w-full rounded-md bg-black/30"
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
        fill="rgba(0,0,0,0.10)"
        stroke="#E4EAF6"
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
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-xs font-bold uppercase text-owl">Measured Overlay</div>
            <h2 className="mt-1 text-xl font-bold text-text">{cardIdentity.name}</h2>
          </div>
          {cardIdentity.rarity && (
            <span className="rounded-md border border-owl/40 bg-owl/10 px-3 py-1.5 font-mono text-xs font-bold uppercase text-owl">
              {cardIdentity.rarity}
            </span>
          )}
        </div>
        <div className="flex min-h-[520px] items-center justify-center rounded-md border border-border bg-deep p-3">
          <OverlaySvg imageSrc={imageSrc} overlay={result.overlay} imageSize={imageSize} tone={viewModel.tone} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className={`inline-flex rounded-md border px-3 py-2 font-mono text-xs font-bold uppercase ${tone.borderClass} ${tone.softClass} ${tone.textClass}`}>
          {viewModel.ceilingLabel}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <RatioBox label="Left / Right" value={viewModel.leftRight} tone={viewModel.tone} />
          <RatioBox label="Top / Bottom" value={viewModel.topBottom} tone={viewModel.tone} />
        </div>
        <div className={`mt-4 rounded-md border p-4 ${tone.borderClass} ${tone.softClass}`}>
          <div className="font-mono text-xs font-bold uppercase text-text-2">Worst axis</div>
          <div className={`mt-2 text-lg font-bold ${tone.textClass}`}>
            {viewModel.worstAxisLabel} at {viewModel.worstAxisValue}
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-deep font-mono text-xs uppercase text-text-2">
              <tr>
                <th className="px-3 py-2">Ceiling</th>
                <th className="px-3 py-2">Ratio</th>
                <th className="px-3 py-2 text-right">Max major</th>
              </tr>
            </thead>
            <tbody>
              {viewModel.thresholds.map((threshold) => (
                <tr key={threshold.ceiling} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold text-text">{threshold.label}</td>
                  <td className="px-3 py-2 font-mono text-text-2">{threshold.ratioLabel}</td>
                  <td className="px-3 py-2 text-right font-mono text-text">{threshold.maxMajorPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-md border border-owl/40 bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase text-void transition-colors hover:bg-owl-light"
          >
            Download report
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase text-text transition-colors hover:border-border-2 hover:bg-surf2"
          >
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
    <div className={`rounded-md border p-4 ${style.borderClass} ${style.softClass}`}>
      <div className="font-mono text-xs font-bold uppercase text-text-2">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-bold ${style.textClass}`}>{value}</div>
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
      className="h-full max-h-[620px] w-full rounded-md bg-black/30"
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
        stroke="#E8A020"
        onHandlePointerDown={(target, corner) => setActiveHandle({ target, corner })}
      />
      <EditableRect
        rect={overlay.innerFrame}
        target="innerFrame"
        stroke="#00D68F"
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
        fill="rgba(0,0,0,0.10)"
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
          stroke="#03050D"
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
      <section className="rounded-lg border border-loss/40 bg-loss/10 p-4">
        <div className="font-mono text-xs font-bold uppercase text-loss">{error?.code ?? "MEASUREMENT_FAILED"}</div>
        <h2 className="mt-2 text-2xl font-bold text-text">{error?.message ?? "Measurement failed."}</h2>
        {showManualCorrection ? (
          <p className="mt-2 text-sm leading-6 text-text-2">
            Drag the outer card and inner frame corners, then re-measure with those corrections.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-text-2">
            Try another image or return to the upload state.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
        {showManualCorrection ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-[520px] items-center justify-center rounded-md border border-border bg-deep p-3">
              <ManualOverlayEditor
                imageSrc={imageSrc}
                imageSize={imageSize}
                overlay={manualOverlay}
                onChange={onManualOverlayChange}
              />
            </div>
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-deep p-4">
                <div className="font-mono text-xs font-bold uppercase text-text-2">Manual correction</div>
                <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs text-text">
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
                className="w-full rounded-md border border-owl/40 bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase text-void transition-colors hover:bg-owl-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                Re-measure with my corrections
              </button>
              <button
                type="button"
                onClick={onReset}
                className="w-full rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase text-text transition-colors hover:border-border-2 hover:bg-surf2"
              >
                Measure another
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase text-text transition-colors hover:border-border-2 hover:bg-surf2"
          >
            Measure another
          </button>
        )}
      </section>
    </div>
  );
}

export default function CenteringWorkspace({
  inventoryItemId,
  preloadImageUrl = null,
  cardIdentity,
}: CenteringWorkspaceProps) {
  const [state, dispatch] = useReducer(centeringReducer, INITIAL_STATE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showUploadZone, setShowUploadZone] = useState(!preloadImageUrl);
  const [preloadFetchError, setPreloadFetchError] = useState<string | null>(null);
  const [manualOverlay, setManualOverlay] = useState<MeasurementOverlay>(() => defaultManualOverlay(1024, 1428));
  const [imageSize, setImageSize] = useState({ width: 1024, height: 1428 });
  const reportRef = useRef<HTMLDivElement>(null);
  const imageSrc = previewUrl ?? preloadImageUrl ?? null;
  const showPreloadedPanel = Boolean(preloadImageUrl && !showUploadZone && !selectedFile);

  useEffect(() => {
    if (!selectedFile) return;
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

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
    setShowUploadZone(!preloadImageUrl);
    setPreloadFetchError(null);
  }, [preloadImageUrl]);

  const submitMeasurement = useCallback(
    async (file: File, overlay?: MeasurementOverlay | null) => {
      dispatch({ type: "startUpload" });
      await delay(250);
      dispatch({ type: "startProcessing" });

      const outcome = await submitMeasurementRequest({
        inventoryItemId,
        file,
        manualOverlay: overlay,
      });

      if (!outcome.ok) {
        dispatch({ type: "failure", error: outcome.error });
        return;
      }

      dispatch({ type: "success", result: outcome.result });
    },
    [inventoryItemId]
  );

  const measureFile = useCallback(
    (file: File) => {
      setPreloadFetchError(null);
      setSelectedFile(file);
      void submitMeasurement(file);
    },
    [submitMeasurement]
  );

  const measurePreloadedFile = useCallback(() => {
    if (!preloadImageUrl) return;

    setPreloadFetchError(null);
    void measurePreloadedImage({
      imageUrl: preloadImageUrl,
      inventoryItemId,
      dispatchAction: dispatch,
      onFile: setSelectedFile,
    }).then((outcome) => {
      if (!outcome.ok && outcome.preloadError) {
        setPreloadFetchError(outcome.preloadError);
        setShowUploadZone(true);
      }
    });
  }, [inventoryItemId, preloadImageUrl]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const [file] = acceptedFiles;
      if (file) measureFile(file);
    },
    [measureFile]
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

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith("image/"));
      if (file) {
        event.preventDefault();
        measureFile(file);
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [measureFile]);

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
          <div className="font-mono text-xs font-bold uppercase text-owl">Owl Lens</div>
          <h2 className="mt-2 text-3xl font-bold text-text">{cardIdentity.name}</h2>
          {headerMeta && <div className="mt-2 font-mono text-xs font-semibold uppercase text-text-2">{headerMeta}</div>}
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs font-semibold uppercase text-text-2">
          {state.status}
        </div>
      </div>

      {state.status === "idle" && (
        <>
          {preloadFetchError && (
            <div className="rounded-md border border-loss/40 bg-loss/10 px-4 py-3 text-sm font-semibold text-text">
              {preloadFetchError}
            </div>
          )}
          {showPreloadedPanel && preloadImageUrl ? (
            <PreloadedImagePanel
              imageSrc={preloadImageUrl}
              onMeasure={measurePreloadedFile}
              onUploadDifferent={() => {
                setPreloadFetchError(null);
                setShowUploadZone(true);
              }}
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
            setSelectedFile(null);
            setPreviewUrl(null);
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
            if (selectedFile) void submitMeasurement(selectedFile, manualOverlay);
          }}
          onReset={() => {
            setSelectedFile(null);
            setPreviewUrl(null);
            dispatch({ type: "reset" });
          }}
        />
      )}
    </section>
  );
}
