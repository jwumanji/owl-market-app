"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { LensFace } from "./lens-types";
import type { UploadFaceState } from "./lens-types";

type UploadPaneProps = {
  face: LensFace;
  upload?: UploadFaceState;
  notice?: ReactNode;
  onFileSelect: (face: LensFace, file: File) => void;
  onClearFace: (face: LensFace) => void;
};

function formatFileSize(value?: number | null) {
  if (!value) return "Ready";
  const mb = value / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function firstClipboardImage(event: ClipboardEvent<HTMLElement>) {
  return Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
}

export default function UploadPane({
  face,
  upload,
  notice = null,
  onFileSelect,
  onClearFace,
}: UploadPaneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const label = face === "front" ? "Front" : "Back";
  const requirement = face === "front" ? "required" : "optional";

  function selectFile(file: File | undefined) {
    if (!file) return;
    onFileSelect(face, file);
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function onReplacePreviewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openFilePicker();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files[0]);
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    const image = firstClipboardImage(event);
    if (!image) return;
    event.preventDefault();
    selectFile(image);
  }

  return (
    <section className="overflow-hidden rounded-c-md border-[1.5px] border-ink bg-bg-2" data-upload-pane={face} onPaste={onPaste}>
      <div className="flex items-center justify-between gap-3 border-b-[1.5px] border-ink bg-bg-3 px-4 py-3">
        <div>
          <div className="font-mono-2 text-[11px] font-bold uppercase tracking-widest text-ink-2">
            {label}
            <span className="text-ink-3"> · {requirement}</span>
          </div>
        </div>
        {upload && (
          <span className="rounded-c-sm border-[1.5px] border-gain-2 bg-[#DCF1E6] px-2 py-1 font-mono-2 text-[9px] font-bold uppercase tracking-wider text-gain-2">
            Uploaded
          </span>
        )}
      </div>

      <div className="space-y-3 bg-bg-2 p-4">
        {notice}
        {upload ? (
          <div className="flex min-h-[360px] flex-col">
            <div
              onClick={openFilePicker}
              onKeyDown={onReplacePreviewKeyDown}
              role="button"
              tabIndex={0}
              aria-label={`Replace ${face} card image`}
              className="group relative flex min-h-[300px] flex-1 cursor-pointer items-center justify-center rounded-c-sm border-[1.5px] border-ink bg-bg-3 p-3 outline-none transition-colors hover:border-coral focus-visible:border-coral focus-visible:ring-2 focus-visible:ring-coral/30"
            >
              {upload.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={upload.previewUrl}
                  alt={`${face} preview`}
                  className="max-h-[380px] max-w-full rounded object-contain"
                />
              ) : (
                <div className="font-mono-2 text-xs uppercase tracking-widest text-ink-3">Preview unavailable</div>
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-c-sm bg-ink/85 px-2 py-1 font-mono-2 text-[9px] font-semibold uppercase tracking-wider text-bg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                Click to replace
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-c-sm border-[1.5px] border-ink bg-bg-2 px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-c-sm border-[1.5px] border-gain-2 bg-[#DCF1E6] text-gain-2">
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono-2 text-xs text-ink">{upload.fileName}</div>
                <div className="mt-0.5 font-mono-2 text-[9px] uppercase tracking-wider text-ink-2">
                  {formatFileSize(upload.fileSize)}
                </div>
              </div>
              <button
                type="button"
                onClick={openFilePicker}
                className="rounded-c-sm border-[1.5px] border-ink px-3 py-1.5 font-mono-2 text-[10px] font-semibold uppercase tracking-wider text-ink-2 transition-colors hover:bg-bg-3 hover:text-ink"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onClearFace(face)}
                className="rounded-c-sm border-[1.5px] border-ink px-3 py-1.5 font-mono-2 text-[10px] font-semibold uppercase tracking-wider text-ink-2 transition-colors hover:bg-bg-3 hover:text-ink"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={openFilePicker}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openFilePicker();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Upload ${face} card image`}
            className={`relative flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-c-md border-2 border-dashed p-10 text-center transition-colors ${
              dragActive
                ? "border-coral bg-bg-3"
                : face === "front"
                  ? "border-coral/50 bg-bg-3 hover:border-coral"
                  : "border-ink-3/50 bg-bg-2 hover:border-ink-3 hover:bg-bg-3"
            }`}
          >
            <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-c-md border-[1.5px] ${face === "front" ? "border-coral text-coral" : "border-ink-3 text-ink-3"}`}>
              ↑
            </div>
            <div className="font-grotesk text-base font-bold text-ink">
              Upload {face === "front" ? "front" : "back"} image
            </div>
            <div className="mt-2 text-sm text-ink-2">
              Drop, paste, or browse for a card scan
            </div>
            <div className="mt-4 font-mono-2 text-[10px] font-medium uppercase tracking-wider text-ink-3">
              {face === "front" ? "Required" : "Optional"} · JPG · PNG · WebP · max 20 MB
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
    </section>
  );
}
