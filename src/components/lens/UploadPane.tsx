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
    <section className="overflow-hidden rounded-lg border border-border bg-surface" data-upload-pane={face} onPaste={onPaste}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-deep px-4 py-3">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-text-2">
            {label}
            <span className="text-text-3"> · {requirement}</span>
          </div>
        </div>
        {upload && (
          <span className="rounded bg-gain/15 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-gain">
            Uploaded
          </span>
        )}
      </div>

      <div className="space-y-3 bg-void p-4">
        {notice}
        {upload ? (
          <div className="flex min-h-[360px] flex-col">
            <div
              onClick={openFilePicker}
              onKeyDown={onReplacePreviewKeyDown}
              role="button"
              tabIndex={0}
              aria-label={`Replace ${face} card image`}
              className="group relative flex min-h-[300px] flex-1 cursor-pointer items-center justify-center rounded-md border border-border bg-surface p-3 outline-none transition-colors hover:border-owl focus-visible:border-owl focus-visible:ring-2 focus-visible:ring-owl/30"
            >
              {upload.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={upload.previewUrl}
                  alt={`${face} preview`}
                  className="max-h-[380px] max-w-full rounded object-contain"
                />
              ) : (
                <div className="font-mono text-xs uppercase tracking-widest text-text-3">Preview unavailable</div>
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-void/85 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                Click to replace
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-md bg-surface px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gain/15 text-gain">
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs text-text">{upload.fileName}</div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-text-2">
                  {formatFileSize(upload.fileSize)}
                </div>
              </div>
              <button
                type="button"
                onClick={openFilePicker}
                className="rounded border border-border-2 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-2 hover:text-text"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onClearFace(face)}
                className="rounded border border-border-2 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-2 hover:text-text"
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
            className={`relative flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
              dragActive
                ? "border-owl bg-owl/10"
                : face === "front"
                  ? "border-owl/40 bg-surface hover:border-owl hover:bg-surf2"
                  : "border-text-2/30 bg-surface hover:border-text-2/60 hover:bg-surf2"
            }`}
          >
            <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-lg border ${face === "front" ? "border-owl text-owl" : "border-text-2 text-text-2"}`}>
              ↑
            </div>
            <div className="text-base font-medium text-text">
              Upload {face === "front" ? "front" : "back"} image
            </div>
            <div className="mt-2 text-sm text-text-2">
              Drop, paste, or browse for a card scan
            </div>
            <div className="mt-4 font-mono text-[10px] font-medium uppercase tracking-wider text-text-3">
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
