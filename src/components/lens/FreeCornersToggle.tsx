"use client";

type FreeCornersToggleProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export default function FreeCornersToggle({ enabled, onChange }: FreeCornersToggleProps) {
  return (
    <div className="rounded-c-sm border-[1.5px] border-ink bg-bg-2 p-3">
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => onChange(!enabled)}
        className={`flex w-full items-center justify-between rounded-c-sm border-[1.5px] px-3 py-2 font-mono-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
          enabled
            ? "border-coral bg-bg-3 text-coral"
            : "border-ink-3 bg-bg-2 text-ink-2 hover:text-ink"
        }`}
      >
        <span>Free corners</span>
        <span className={`h-2.5 w-2.5 rounded-full ${enabled ? "bg-coral" : "bg-ink-3"}`} />
      </button>
      <div className="mt-2 font-mono-2 text-[10px] text-ink-2">
        {enabled ? "rotation off · corners drag freely" : "hold Shift to drag one freely"}
      </div>
    </div>
  );
}
