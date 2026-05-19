import type { UploadFaceState } from "./lens-types";

type CardPreviewColumnProps = {
  frontUpload?: UploadFaceState;
};

export default function CardPreviewColumn({
  frontUpload,
}: CardPreviewColumnProps) {
  const previewUrl = frontUpload?.previewUrl;

  return (
    <aside className="space-y-2 rounded-lg border border-border bg-surface p-4" data-card-preview-column="true">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">
        PREVIEW
      </div>
      <div
        className={`flex aspect-[2.5/3.5] items-center justify-center overflow-hidden rounded-lg bg-deep/70 text-center ${
          previewUrl
            ? "border border-border"
            : "border border-dashed border-border-2 p-4 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-3"
        }`}
        data-card-preview={previewUrl ? "front" : "empty"}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Front card thumbnail"
            className="h-full w-full object-contain"
          />
        ) : (
          "Card preview"
        )}
      </div>
    </aside>
  );
}
