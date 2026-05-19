import type { UploadFaceState } from "./lens-types";

type CardInfoColumnProps = {
  cardIdentity: string;
  frontUpload?: UploadFaceState;
  onCardIdentityChange: (value: string) => void;
};

export default function CardInfoColumn({
  cardIdentity,
  frontUpload,
  onCardIdentityChange,
}: CardInfoColumnProps) {
  const previewUrl = frontUpload?.previewUrl;

  return (
    <aside className="space-y-4 rounded-lg border border-border bg-surface p-4" data-card-info-column="true">
      <div>
        <label className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">
          Card name
        </label>
        <input
          value={cardIdentity}
          onChange={(event) => onCardIdentityChange(event.target.value)}
          placeholder="Add card name..."
          className="w-full rounded-lg border border-border bg-deep px-3.5 py-3 text-sm text-text outline-none transition-colors placeholder:text-text-3 focus:border-owl/50"
        />
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
