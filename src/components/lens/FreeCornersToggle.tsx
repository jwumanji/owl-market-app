"use client";

type FreeCornersToggleProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export default function FreeCornersToggle({ enabled, onChange }: FreeCornersToggleProps) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => onChange(!enabled)}
        className={`flex w-full items-center justify-between rounded-md border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
          enabled
            ? "border-owl/50 bg-owl/10 text-owl"
            : "border-border-2 bg-deep text-text-2 hover:text-text"
        }`}
      >
        <span>Free corners</span>
        <span className={`h-2.5 w-2.5 rounded-full ${enabled ? "bg-owl" : "bg-text-3"}`} />
      </button>
      <div className="mt-2 font-mono text-[10px] text-text-2">
        {enabled ? "rotation off · corners drag freely" : "hold Shift to drag one freely"}
      </div>
    </div>
  );
}
