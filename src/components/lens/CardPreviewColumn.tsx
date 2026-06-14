import type { UploadFaceState } from "./lens-types";

type CardPreviewColumnProps = {
  frontUpload?: UploadFaceState;
};

export default function CardPreviewColumn({
  frontUpload,
}: CardPreviewColumnProps) {
  const previewUrl = frontUpload?.previewUrl;

  return (
    <aside className="space-y-2 rounded-c-md border-[1.5px] border-ink bg-bg-2 p-4" data-card-preview-column="true">
      <div className="font-mono-2 text-[10px] font-bold uppercase tracking-wider text-ink-2">
        PREVIEW
      </div>
      <div
        className={`flex aspect-[2.5/3.5] items-center justify-center overflow-hidden rounded-c-md bg-bg-3 text-center ${
          previewUrl
            ? "border-[1.5px] border-ink"
            : "border-[1.5px] border-dashed border-ink-3 p-4 font-mono-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3"
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
