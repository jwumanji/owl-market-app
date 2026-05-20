"use client";

import { useEffect, useReducer, useRef } from "react";
import Link from "next/link";
import {
  computeMeasurements,
  overlayGeometryFromUnknown,
  type OverlayGeometry,
} from "@/lib/centering-math";
import type { operations } from "@/lib/owl-lens/openapi.generated";
import CardPreviewColumn from "./CardPreviewColumn";
import FailureNotice from "./FailureNotice";
import ResultsPanel from "./ResultsPanel";
import ReviewWorkspace from "./ReviewWorkspace";
import UploadPane from "./UploadPane";
import type { LensFace, LensFaceState, UploadFaceState } from "./lens-types";

type MeasurementResponse =
  operations["measureCardCentering"]["responses"][200]["content"]["application/json"];

type WorkflowStatus = "idle" | "uploading" | "processing" | "review" | "results";
type UploadedFace = UploadFaceState & {
  file: File;
  imageSize: { width: number; height: number };
  contentType: string;
  previewUrl: string;
};
type FaceMeta = {
  pipelineMode: "mock" | "opencv";
  pipelineVersion: string;
  processingMs: number;
  originalOverlay: OverlayGeometry | null;
};
type ApiErrorCode =
  | "INVALID_UPLOAD"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "IMAGE_TOO_SMALL"
  | "IMAGE_UNREADABLE"
  | "CARD_NOT_DETECTED"
  | "MEASUREMENT_FAILED"
  | "CV_SERVICE_OFFLINE";
type MeasurementFailure = {
  code: ApiErrorCode;
  message: string;
  status: number;
};
type ReviewNotice =
  | { kind: "manual"; body: string; tone?: "warning" | "error" }
  | { kind: "backFailed" }
  | { kind: "saveError"; body: string };

type PregradeState = {
  status: WorkflowStatus;
  activeUploadFace: LensFace;
  activeReviewFace: LensFace;
  cardIdentity: string;
  cardSessionId: string;
  remeasureMode: boolean;
  uploads: Partial<Record<LensFace, UploadedFace>>;
  faces: Partial<Record<LensFace, LensFaceState>>;
  faceMeta: Partial<Record<LensFace, FaceMeta>>;
  idleNotices: Partial<Record<LensFace, string>>;
  reviewNotice: ReviewNotice | null;
  addBackMode: boolean;
  isSaving: boolean;
};

type Action =
  | { type: "setCardIdentity"; value: string }
  | { type: "setActiveUploadFace"; face: LensFace }
  | { type: "setActiveReviewFace"; face: LensFace }
  | { type: "fileAccepted"; face: LensFace; upload: UploadedFace }
  | { type: "clearFace"; face: LensFace }
  | { type: "uploadError"; face: LensFace; message: string }
  | { type: "startMeasure" }
  | { type: "startProcessing" }
  | {
      type: "receiveCvResult";
      face: LensFace;
      overlay: OverlayGeometry;
      imageSize: { width: number; height: number };
      response: MeasurementResponse;
    }
  | { type: "receiveCvPlaceholder"; face: LensFace; overlay: OverlayGeometry }
  | { type: "finishMeasure"; activeFace: LensFace; notice: ReviewNotice | null }
  | { type: "overlayChange"; face: LensFace; overlay: OverlayGeometry }
  | { type: "freeCornersChange"; face: LensFace; enabled: boolean }
  | { type: "resetFace"; face: LensFace; overlay: OverlayGeometry }
  | { type: "addBack" }
  | { type: "continueFrontOnly" }
  | { type: "reopenSavedSession" }
  | { type: "cancelReview" }
  | { type: "startSave" }
  | { type: "saveSuccess" }
  | { type: "saveError"; message: string }
  | { type: "resetAll" };

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_IMAGE_DIMENSION = 400;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FACE_ORDER: LensFace[] = ["front", "back"];

function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

const COPY = {
  idleAddBack:
    "Front measurement is saved. Add a back image, then click Measure to complete the pair. The front won't be re-measured.",
  cardNotDetected:
    "We couldn't lock onto a card automatically. Frame the borders yourself and we'll measure your version.",
  backFailedTitle: "Back-side measurement didn't go through.",
  backFailedBody: "The front is ready to review — retry the back, or save the front-only result.",
  cvOffline:
    "Centering service is offline. Probably a deploy in flight, or Railway's having a moment. The pre-grade pipeline is fine — try again in a sec.",
  fileTooLarge: "Image is too large. The upload limit is 20 MB. Try a smaller scan or compress the JPEG.",
  unsupportedFormat: "Only JPG, PNG, and WebP are supported. Convert your image and try again.",
  imageTooSmall:
    "Image is too small to measure accurately. Minimum dimension is 400px. Try a higher-resolution scan.",
};

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createInitialPregradeState(): PregradeState {
  return {
    status: "idle",
    activeUploadFace: "front",
    activeReviewFace: "front",
    cardIdentity: "",
    cardSessionId: randomId(),
    remeasureMode: false,
    uploads: {},
    faces: {},
    faceMeta: {},
    idleNotices: {},
    reviewNotice: null,
    addBackMode: false,
    isSaving: false,
  };
}

function rectOverlay({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    tl: { x, y },
    tr: { x: x + width, y },
    br: { x: x + width, y: y + height },
    bl: { x, y: y + height },
  };
}

function defaultPlaceholderOverlay(width: number, height: number): OverlayGeometry {
  const outerX = Math.round(width * 0.06);
  const outerY = Math.round(height * 0.04);
  const outerWidth = Math.max(120, width - outerX * 2);
  const outerHeight = Math.max(180, height - outerY * 2);
  const innerX = outerX + Math.round(outerWidth * 0.1);
  const innerY = outerY + Math.round(outerHeight * 0.11);
  const innerWidth = Math.max(80, outerWidth - (innerX - outerX) * 2);
  const innerHeight = Math.max(120, outerHeight - Math.round(outerHeight * 0.22));

  return {
    outer: rectOverlay({ x: outerX, y: outerY, width: outerWidth, height: outerHeight }),
    inner: rectOverlay({ x: innerX, y: innerY, width: innerWidth, height: innerHeight }),
  };
}

export function pregradeReducer(state: PregradeState, action: Action): PregradeState {
  switch (action.type) {
    case "setCardIdentity":
      return { ...state, cardIdentity: action.value };
    case "setActiveUploadFace":
      return { ...state, activeUploadFace: action.face };
    case "setActiveReviewFace":
      return {
        ...state,
        activeReviewFace: action.face,
        faces: {
          ...state.faces,
          [action.face]: state.faces[action.face]
            ? { ...state.faces[action.face]!, unviewed: false }
            : state.faces[action.face],
        },
      };
    case "fileAccepted": {
      const faces = { ...state.faces };
      const faceMeta = { ...state.faceMeta };
      delete faces[action.face];
      delete faceMeta[action.face];
      const idleNotices = { ...state.idleNotices };
      delete idleNotices[action.face];
      return {
        ...state,
        activeUploadFace: action.face,
        uploads: { ...state.uploads, [action.face]: action.upload },
        faces,
        faceMeta,
        idleNotices,
        reviewNotice: null,
        addBackMode: false,
        remeasureMode: false,
      };
    }
    case "clearFace": {
      const uploads = { ...state.uploads };
      const faces = { ...state.faces };
      const faceMeta = { ...state.faceMeta };
      delete uploads[action.face];
      delete faces[action.face];
      delete faceMeta[action.face];
      const idleNotices = { ...state.idleNotices };
      delete idleNotices[action.face];
      return {
        ...state,
        uploads,
        faces,
        faceMeta,
        activeUploadFace: action.face,
        idleNotices,
        addBackMode: action.face === "back" ? state.addBackMode : false,
      };
    }
    case "uploadError":
      return {
        ...state,
        status: "idle",
        activeUploadFace: action.face,
        idleNotices: { ...state.idleNotices, [action.face]: action.message },
        isSaving: false,
      };
    case "startMeasure":
      return { ...state, status: "uploading", idleNotices: {}, reviewNotice: null, isSaving: false };
    case "startProcessing":
      return { ...state, status: "processing" };
    case "receiveCvResult": {
      const upload = state.uploads[action.face];
      return {
        ...state,
        faces: {
          ...state.faces,
          [action.face]: {
            face: action.face,
            overlay: action.overlay,
            imageUrl: upload?.previewUrl ?? null,
            imageSize: action.imageSize,
            adjusted: false,
            freeCorners: false,
            unviewed: action.face === "back",
          },
        },
        faceMeta: {
          ...state.faceMeta,
          [action.face]: {
            pipelineMode: action.response.pipeline.mode,
            pipelineVersion: action.response.pipeline.version,
            processingMs: action.response.metadata.processingMs,
            originalOverlay: action.overlay,
          },
        },
      };
    }
    case "receiveCvPlaceholder": {
      const upload = state.uploads[action.face];
      return {
        ...state,
        faces: {
          ...state.faces,
          [action.face]: {
            face: action.face,
            overlay: action.overlay,
            imageUrl: upload?.previewUrl ?? null,
            imageSize: upload?.imageSize ?? { width: 420, height: 580 },
            adjusted: true,
            freeCorners: false,
            unviewed: action.face === "back",
          },
        },
        faceMeta: {
          ...state.faceMeta,
          [action.face]: {
            pipelineMode: "mock",
            pipelineVersion: "manual-placeholder",
            processingMs: 0,
            originalOverlay: null,
          },
        },
      };
    }
    case "finishMeasure":
      return {
        ...state,
        status: "review",
        activeReviewFace: action.activeFace,
        reviewNotice: action.notice,
        addBackMode: false,
        remeasureMode: false,
      };
    case "overlayChange":
      if (!state.faces[action.face]) return state;
      return {
        ...state,
        faces: {
          ...state.faces,
          [action.face]: {
            ...state.faces[action.face]!,
            overlay: action.overlay,
            adjusted: true,
          },
        },
      };
    case "freeCornersChange":
      if (!state.faces[action.face]) return state;
      return {
        ...state,
        faces: {
          ...state.faces,
          [action.face]: {
            ...state.faces[action.face]!,
            freeCorners: action.enabled,
          },
        },
      };
    case "resetFace":
      if (!state.faces[action.face]) return state;
      return {
        ...state,
        faces: {
          ...state.faces,
          [action.face]: {
            ...state.faces[action.face]!,
            overlay: action.overlay,
            adjusted: false,
            freeCorners: false,
          },
        },
      };
    case "addBack":
      return {
        ...state,
        status: "idle",
        activeUploadFace: "back",
        idleNotices: {},
        reviewNotice: null,
        addBackMode: true,
      };
    case "continueFrontOnly": {
      const faces = { ...state.faces };
      const faceMeta = { ...state.faceMeta };
      delete faces.back;
      delete faceMeta.back;
      return {
        ...state,
        faces,
        faceMeta,
        activeReviewFace: "front",
        reviewNotice: null,
      };
    }
    case "reopenSavedSession":
      return {
        ...state,
        status: "review",
        activeReviewFace: state.faces.front ? "front" : state.faces.back ? "back" : state.activeReviewFace,
        reviewNotice: null,
        addBackMode: false,
        isSaving: false,
        remeasureMode: true,
      };
    case "cancelReview":
      if (state.remeasureMode) {
        return {
          ...state,
          status: "results",
          reviewNotice: null,
          isSaving: false,
          remeasureMode: false,
        };
      }
      return {
        ...state,
        status: "idle",
        activeUploadFace: state.activeReviewFace,
        reviewNotice: null,
      };
    case "startSave":
      return { ...state, isSaving: true, reviewNotice: null };
    case "saveSuccess":
      return { ...state, status: "results", isSaving: false, reviewNotice: null, remeasureMode: false };
    case "saveError":
      return {
        ...state,
        status: "review",
        isSaving: false,
        reviewNotice: { kind: "saveError", body: action.message },
      };
    case "resetAll":
      return createInitialPregradeState();
    default:
      return state;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function uploadErrorCopy(code: ApiErrorCode) {
  if (code === "FILE_TOO_LARGE") return COPY.fileTooLarge;
  if (code === "UNSUPPORTED_FORMAT" || code === "UNSUPPORTED_MEDIA_TYPE") return COPY.unsupportedFormat;
  if (code === "IMAGE_TOO_SMALL") return COPY.imageTooSmall;
  return "We couldn't read that upload. Try a JPG, PNG, or WebP scan under 20 MB.";
}

function isUploadTimeFailure(failure: MeasurementFailure) {
  return (
    failure.code === "FILE_TOO_LARGE" ||
    failure.code === "UNSUPPORTED_FORMAT" ||
    failure.code === "UNSUPPORTED_MEDIA_TYPE" ||
    failure.code === "IMAGE_TOO_SMALL" ||
    failure.code === "INVALID_UPLOAD" ||
    failure.status === 400 ||
    failure.status === 413 ||
    failure.status === 415
  );
}

function cvNoticeForFailures(failures: Partial<Record<LensFace, MeasurementFailure>>): ReviewNotice | null {
  if (failures.back && !failures.front) {
    return { kind: "backFailed" };
  }

  const first = failures.front ?? failures.back;
  if (!first) return null;

  if (first.code === "CV_SERVICE_OFFLINE") {
    return { kind: "manual", body: COPY.cvOffline, tone: "error" };
  }

  return { kind: "manual", body: COPY.cardNotDetected };
}

async function readImageSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error("Image could not be read"));
    image.src = url;
  });
}

function parseErrorCode(value: unknown, status: number): ApiErrorCode {
  if (value === "FILE_TOO_LARGE") return "FILE_TOO_LARGE";
  if (value === "UNSUPPORTED_MEDIA_TYPE" || value === "UNSUPPORTED_FORMAT") return value;
  if (value === "IMAGE_TOO_SMALL") return "IMAGE_TOO_SMALL";
  if (value === "IMAGE_UNREADABLE") return "IMAGE_UNREADABLE";
  if (value === "CARD_NOT_DETECTED") return "CARD_NOT_DETECTED";
  if (value === "INVALID_UPLOAD") return "INVALID_UPLOAD";
  if (value === "MEASUREMENT_FAILED") return "MEASUREMENT_FAILED";
  if (status === 413) return "FILE_TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
  if (status >= 500) return "CV_SERVICE_OFFLINE";
  return "MEASUREMENT_FAILED";
}

async function parseFailure(response: Response): Promise<MeasurementFailure> {
  const text = await response.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  const errorValue = parsed && typeof parsed === "object" && "error" in parsed
    ? (parsed as { error?: unknown }).error
    : null;
  const errorRecord = errorValue && typeof errorValue === "object" ? errorValue as { code?: unknown; message?: unknown } : null;
  const code = parseErrorCode(errorRecord?.code, response.status);
  const fallbackMessage = typeof errorValue === "string" ? errorValue : response.statusText;

  return {
    code,
    message: typeof errorRecord?.message === "string" ? errorRecord.message : fallbackMessage,
    status: response.status,
  };
}

async function measureFace({
  face,
  upload,
  cardIdentity,
  cardSessionId,
}: {
  face: LensFace;
  upload: UploadedFace;
  cardIdentity: string;
  cardSessionId: string;
}) {
  const formData = new FormData();
  formData.set("file", upload.file);
  formData.set("face", face);
  formData.set("persist", "false");
  formData.set("cardSessionId", cardSessionId);
  if (cardIdentity.trim()) formData.set("cardIdentity", cardIdentity.trim());

  let response: Response;
  try {
    response = await fetch("/api/centering/measure", {
      method: "POST",
      body: formData,
    });
  } catch {
    return {
      ok: false as const,
      failure: {
        code: "CV_SERVICE_OFFLINE" as const,
        message: COPY.cvOffline,
        status: 502,
      },
    };
  }

  if (!response.ok) {
    return { ok: false as const, failure: await parseFailure(response) };
  }

  const result = await response.json().catch(() => null) as MeasurementResponse | null;
  const overlay = overlayGeometryFromUnknown(result?.overlay);
  if (!result || !overlay) {
    return {
      ok: false as const,
      failure: {
        code: "MEASUREMENT_FAILED" as const,
        message: "Centering service returned an unreadable measurement.",
        status: 502,
      },
    };
  }

  return {
    ok: true as const,
    result,
    overlay,
    imageSize: {
      width: result.image.widthPx || upload.imageSize.width,
      height: result.image.heightPx || upload.imageSize.height,
    },
  };
}

export async function saveFace({
  face,
  upload,
  faceState,
  faceMeta,
  cardIdentity,
  cardSessionId,
  updateExisting = false,
  fetchImpl = fetch,
}: {
  face: LensFace;
  upload: UploadedFace;
  faceState: LensFaceState;
  faceMeta: FaceMeta | undefined;
  cardIdentity: string;
  cardSessionId: string;
  updateExisting?: boolean;
  fetchImpl?: typeof fetch;
}) {
  const formData = new FormData();
  formData.set("file", upload.file);
  formData.set("face", face);
  formData.set("cardSessionId", cardSessionId);
  if (updateExisting) formData.set("updateExisting", "true");
  formData.set("overlayGeometry", JSON.stringify(faceState.overlay));
  formData.set("imageWidthPx", String(faceState.imageSize.width));
  formData.set("imageHeightPx", String(faceState.imageSize.height));
  formData.set("pipelineMode", faceMeta?.pipelineMode ?? "mock");
  formData.set("pipelineVersion", faceMeta?.pipelineVersion ?? "manual-save");
  formData.set("processingMs", String(faceMeta?.processingMs ?? 0));
  if (faceMeta?.originalOverlay) {
    formData.set("cvOverlayGeometry", JSON.stringify(faceMeta.originalOverlay));
  }
  if (cardIdentity.trim()) {
    formData.set("cardIdentity", cardIdentity.trim());
  }

  const response = await fetchImpl("/api/centering/save", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const failure = await parseFailure(response);
    throw new Error(failure.message || "Could not save measurement.");
  }
}

function ProcessingPanel({
  status,
  faces,
}: {
  status: "uploading" | "processing";
  faces: LensFace[];
}) {
  const suffix = faces.length > 1 ? " (front, back)" : ` (${faces[0]})`;
  const steps = [
    "Validating images",
    "Finding card boundaries",
    "Measuring border ratios",
    "Calculating PSA ceiling",
  ];
  const activeIndex = status === "uploading" ? 0 : 1;

  return (
    <section className="rounded-lg border border-border bg-surface p-8">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-border-2 border-t-owl" />
        <h2 className="mt-5 text-2xl font-semibold text-text">
          {status === "uploading" ? "Validating upload" : "Measuring centering"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-2">
          1-3 seconds per face.
        </p>
        <div className="mt-6 w-full space-y-2 text-left">
          {steps.map((step, index) => (
            <div
              key={step}
              className={`rounded-md border px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wider ${
                index <= activeIndex
                  ? "border-owl/40 bg-owl/10 text-owl"
                  : "border-border bg-deep text-text-2"
              }`}
            >
              {step}
              {suffix}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function renderUploadNotice(message: string | null) {
  if (!message) return null;
  return <FailureNotice tone="error">{message}</FailureNotice>;
}

type PregradeUploadStateProps = {
  cardIdentity: string;
  uploads: Partial<Record<LensFace, UploadFaceState>>;
  idleNotices: Partial<Record<LensFace, string>>;
  addBackMode: boolean;
  onCardIdentityChange: (value: string) => void;
  onFileSelect: (face: LensFace, file: File) => void;
  onClearFace: (face: LensFace) => void;
  onMeasure: () => void;
};

export function PregradeUploadState({
  cardIdentity,
  uploads,
  idleNotices,
  addBackMode,
  onCardIdentityChange,
  onFileSelect,
  onClearFace,
  onMeasure,
}: PregradeUploadStateProps) {
  const canMeasure = Boolean(uploads.front);

  return (
    <section className="space-y-5" data-pregrade-upload-state="true">
      {addBackMode && !uploads.back && (
        <div className="rounded-md border border-owl/40 bg-owl/10 px-4 py-3 text-sm text-text">
          {COPY.idleAddBack}
        </div>
      )}

      <div data-card-name-row="true">
        <label className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">
          CARD NAME
        </label>
        <input
          value={cardIdentity}
          onChange={(event) => onCardIdentityChange(event.target.value)}
          placeholder="Add card name..."
          className="w-full rounded-lg border border-border bg-deep px-3.5 py-3 text-sm text-text outline-none transition-colors placeholder:text-text-3 focus:border-owl/50"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]" data-upload-columns="true">
        <CardPreviewColumn
          frontUpload={uploads.front}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <UploadPane
            face="front"
            upload={uploads.front}
            notice={renderUploadNotice(idleNotices.front ?? null)}
            onFileSelect={onFileSelect}
            onClearFace={onClearFace}
          />
          <UploadPane
            face="back"
            upload={uploads.back}
            notice={renderUploadNotice(idleNotices.back ?? null)}
            onFileSelect={onFileSelect}
            onClearFace={onClearFace}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={!canMeasure}
          onClick={onMeasure}
          className="rounded-lg bg-owl px-8 py-3 font-mono text-xs font-bold uppercase tracking-widest text-void transition-colors hover:bg-owl-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          Measure
        </button>
        <div className="text-center text-xs text-text-2">
          Images are saved with your measurement so you can re-open and adjust later.
        </div>
      </div>
    </section>
  );
}

function reviewNoticeNode({
  notice,
  onRetryBack,
  onContinueFrontOnly,
}: {
  notice: ReviewNotice | null;
  onRetryBack: () => void;
  onContinueFrontOnly: () => void;
}) {
  if (!notice) return null;

  if (notice.kind === "backFailed") {
    return (
      <FailureNotice
        title={COPY.backFailedTitle}
        actions={
          <>
            <button
              type="button"
              onClick={onRetryBack}
              className="rounded-md border border-owl/40 bg-owl px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
            >
              Retry back
            </button>
            <button
              type="button"
              onClick={onContinueFrontOnly}
              className="rounded-md border border-border bg-deep px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:bg-surf2"
            >
              Continue with front only
            </button>
          </>
        }
      >
        {COPY.backFailedBody}
      </FailureNotice>
    );
  }

  return (
    <FailureNotice tone={notice.kind === "saveError" || notice.tone === "error" ? "error" : "warning"}>
      {notice.body}
    </FailureNotice>
  );
}

function safeFileName(value: string) {
  return (value.trim() || "owl-lens-pregrade").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export default function PregradeWorkspace() {
  const [state, dispatch] = useReducer(pregradeReducer, undefined, createInitialPregradeState);
  const uploadsRef = useRef(state.uploads);

  useEffect(() => {
    uploadsRef.current = state.uploads;
  }, [state.uploads]);

  useEffect(() => {
    return () => {
      FACE_ORDER.forEach((face) => {
        const previewUrl = uploadsRef.current[face]?.previewUrl;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      });
    };
  }, []);

  async function handleFileSelected(face: LensFace, file: File) {
    if (!ACCEPTED_TYPES.has(file.type)) {
      dispatch({ type: "uploadError", face, message: uploadErrorCopy("UNSUPPORTED_FORMAT") });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      dispatch({ type: "uploadError", face, message: uploadErrorCopy("FILE_TOO_LARGE") });
      return;
    }

    const previousUrl = state.uploads[face]?.previewUrl;
    const previewUrl = URL.createObjectURL(file);
    let imageSize: { width: number; height: number };
    try {
      imageSize = await readImageSize(previewUrl);
    } catch {
      URL.revokeObjectURL(previewUrl);
      dispatch({ type: "uploadError", face, message: uploadErrorCopy("INVALID_UPLOAD") });
      return;
    }

    if (Math.min(imageSize.width, imageSize.height) < MIN_IMAGE_DIMENSION) {
      URL.revokeObjectURL(previewUrl);
      dispatch({ type: "uploadError", face, message: uploadErrorCopy("IMAGE_TOO_SMALL") });
      return;
    }

    if (previousUrl) URL.revokeObjectURL(previousUrl);
    dispatch({
      type: "fileAccepted",
      face,
      upload: {
        file,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        previewUrl,
        imageSize,
      },
    });
  }

  function handleClearFace(face: LensFace) {
    const previousUrl = state.uploads[face]?.previewUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    dispatch({ type: "clearFace", face });
  }

  async function runMeasurement(forcedFaces?: LensFace[]) {
    if (!state.uploads.front) {
      dispatch({ type: "uploadError", face: "front", message: "Add a front image before measuring." });
      return;
    }

    const facesToMeasure = (forcedFaces ?? FACE_ORDER.filter((face) => state.uploads[face] && !state.faces[face]))
      .filter((face) => Boolean(state.uploads[face]));

    if (facesToMeasure.length === 0) {
      dispatch({
        type: "finishMeasure",
        activeFace: state.faces.front ? "front" : "back",
        notice: null,
      });
      return;
    }

    dispatch({ type: "startMeasure" });
    await delay(180);
    dispatch({ type: "startProcessing" });

    const failures: Partial<Record<LensFace, MeasurementFailure>> = {};
    const completedFaces: Partial<Record<LensFace, LensFaceState>> = { ...state.faces };

    for (const face of facesToMeasure) {
      const upload = state.uploads[face];
      if (!upload) continue;

      const measured = await measureFace({
        face,
        upload,
        cardIdentity: state.cardIdentity,
        cardSessionId: state.cardSessionId,
      });

      if (measured.ok) {
        const nextFace: LensFaceState = {
          face,
          overlay: measured.overlay,
          imageUrl: upload.previewUrl,
          imageSize: measured.imageSize,
          adjusted: false,
          freeCorners: false,
          unviewed: face === "back",
        };
        completedFaces[face] = nextFace;
        dispatch({
          type: "receiveCvResult",
          face,
          overlay: measured.overlay,
          imageSize: measured.imageSize,
          response: measured.result,
        });
        continue;
      }

      if (isUploadTimeFailure(measured.failure)) {
        dispatch({
          type: "uploadError",
          face,
          message: uploadErrorCopy(measured.failure.code),
        });
        return;
      }

      failures[face] = measured.failure;
      if (face === "back" && completedFaces.front && !failures.front) {
        continue;
      }

      const overlay = defaultPlaceholderOverlay(upload.imageSize.width, upload.imageSize.height);
      completedFaces[face] = {
        face,
        overlay,
        imageUrl: upload.previewUrl,
        imageSize: upload.imageSize,
        adjusted: true,
        freeCorners: false,
        unviewed: face === "back",
      };
      dispatch({ type: "receiveCvPlaceholder", face, overlay });
    }

    const activeFace = failures.back && completedFaces.front
      ? "front"
      : completedFaces.front
        ? "front"
        : "back";

    dispatch({
      type: "finishMeasure",
      activeFace,
      notice: cvNoticeForFailures(failures),
    });
  }

  async function handleSave() {
    const facesToSave = FACE_ORDER.filter((face) => state.faces[face] && state.uploads[face]);
    if (facesToSave.length === 0) {
      dispatch({ type: "saveError", message: "No measurement is ready to save." });
      return;
    }

    dispatch({ type: "startSave" });
    try {
      for (const face of facesToSave) {
        await saveFace({
          face,
          upload: state.uploads[face]!,
          faceState: state.faces[face]!,
          faceMeta: state.faceMeta[face],
          cardIdentity: state.cardIdentity,
          cardSessionId: state.cardSessionId,
          updateExisting: state.remeasureMode,
        });
      }
      dispatch({ type: "saveSuccess" });
    } catch (error) {
      dispatch({
        type: "saveError",
        message: error instanceof Error ? error.message : "Could not save measurement.",
      });
    }
  }

  function handleResetFace(face: LensFace) {
    const upload = state.uploads[face];
    if (!upload) return;
    const overlay = state.faceMeta[face]?.originalOverlay
      ?? defaultPlaceholderOverlay(upload.imageSize.width, upload.imageSize.height);
    dispatch({ type: "resetFace", face, overlay });
  }

  function handleMeasureAnother() {
    FACE_ORDER.forEach((face) => {
      const previewUrl = state.uploads[face]?.previewUrl;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    });
    dispatch({ type: "resetAll" });
  }

  function handleReMeasure() {
    dispatch({ type: "reopenSavedSession" });
  }

  function handleDownloadReport() {
    const faces = FACE_ORDER
      .filter((face) => state.faces[face])
      .map((face) => {
        const faceState = state.faces[face]!;
        return {
          face,
          measurement: computeMeasurements(faceState.overlay),
          overlayGeometry: faceState.overlay,
          adjusted: Boolean(faceState.adjusted),
        };
      });

    const blob = new Blob([
      JSON.stringify(
        {
          cardIdentity: state.cardIdentity || null,
          cardSessionId: state.cardSessionId,
          faces,
        },
        null,
        2
      ),
    ], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(state.cardIdentity)}-centering-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const processingFaces = FACE_ORDER.filter((face) => state.uploads[face] && !state.faces[face]);
  const isResults = state.status === "results";
  const reviewNotice = reviewNoticeNode({
    notice: state.reviewNotice,
    onRetryBack: () => void runMeasurement(["back"]),
    onContinueFrontOnly: () => dispatch({ type: "continueFrontOnly" }),
  });

  return (
    <section className="mx-auto flex min-h-[calc(100vh-96px)] max-w-[1280px] flex-col px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">
            Owl Lens
          </p>
          <h1 className="text-4xl font-bold text-text">
            {isResults ? "Pre-grade report" : "Pre-grade"}
          </h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-text-2">
            {isResults
              ? "Saved centering report with combined ceiling, grader readouts, and per-face ratios."
              : "Upload a front scan, add the back when you have it, then verify the overlay before saving the centering result."}
          </p>
        </div>
        <Link
          href="/admin/lens"
          aria-label="Back to Owl Lens"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-text-2 transition-colors hover:border-border-2 hover:text-owl focus-visible:border-owl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-owl/30"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
      </div>

      {state.status === "idle" && (
        <PregradeUploadState
          uploads={state.uploads}
          cardIdentity={state.cardIdentity}
          idleNotices={state.idleNotices}
          addBackMode={state.addBackMode}
          onCardIdentityChange={(value) => dispatch({ type: "setCardIdentity", value })}
          onFileSelect={(face, file) => void handleFileSelected(face, file)}
          onClearFace={handleClearFace}
          onMeasure={() => void runMeasurement()}
        />
      )}

      {(state.status === "uploading" || state.status === "processing") && (
        <ProcessingPanel
          status={state.status}
          faces={processingFaces.length > 0 ? processingFaces : ["front"]}
        />
      )}

      {state.status === "review" && (
        <ReviewWorkspace
          faces={state.faces}
          activeFace={state.activeReviewFace}
          cardIdentity={state.cardIdentity || null}
          notice={reviewNotice}
          saving={state.isSaving}
          mode={state.remeasureMode ? "edit" : "review"}
          allowAddBack={!state.remeasureMode && state.reviewNotice?.kind !== "backFailed"}
          onActiveFaceChange={(face) => dispatch({ type: "setActiveReviewFace", face })}
          onOverlayChange={(face, overlay) => dispatch({ type: "overlayChange", face, overlay })}
          onFreeCornersChange={(face, enabled) => dispatch({ type: "freeCornersChange", face, enabled })}
          onAddBack={() => dispatch({ type: "addBack" })}
          onSave={() => void handleSave()}
          onResetFace={handleResetFace}
          onCancel={() => dispatch({ type: "cancelReview" })}
        />
      )}

      {state.status === "results" && (
        <ResultsPanel
          faces={state.faces}
          activeFace={state.activeReviewFace}
          cardIdentity={state.cardIdentity || null}
          cardSessionId={state.cardSessionId}
          onActiveFaceChange={(face) => dispatch({ type: "setActiveReviewFace", face })}
          onCardIdentityChange={(value) => dispatch({ type: "setCardIdentity", value })}
          onReMeasure={handleReMeasure}
          onDownloadReport={handleDownloadReport}
          onMeasureAnother={handleMeasureAnother}
        />
      )}
    </section>
  );
}
