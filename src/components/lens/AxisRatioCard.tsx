import { TINTED_TONE_CLASSES, TONE_TEXT_CLASSES, type GraderTone } from "./grading";

type AxisRatioValueProps = {
  firstLabel: "L" | "T";
  firstValue: number;
  secondLabel: "R" | "B";
  secondValue: number;
  tone: GraderTone;
  size?: "sm" | "md";
};

type AxisRatioCardProps = AxisRatioValueProps & {
  label: "L / R" | "T / B";
};

export function AxisRatioValue({
  firstLabel,
  firstValue,
  secondLabel,
  secondValue,
  tone,
  size = "sm",
}: AxisRatioValueProps) {
  const valueSize = size === "md" ? "text-[13px]" : "text-[12px]";

  return (
    <div className={`mt-1 flex max-w-full min-w-0 flex-nowrap items-baseline gap-1 font-mono font-bold tabular-nums ${valueSize}`}>
      <span className="shrink-0 text-[8px] uppercase tracking-wider text-text-2">{firstLabel}</span>
      <span className={TONE_TEXT_CLASSES[tone]}>{firstValue}</span>
      <span className="shrink-0 text-text-3">/</span>
      <span className="shrink-0 text-[8px] uppercase tracking-wider text-text-2">{secondLabel}</span>
      <span className={TONE_TEXT_CLASSES[tone]}>{secondValue}</span>
    </div>
  );
}

export default function AxisRatioCard({
  label,
  firstLabel,
  firstValue,
  secondLabel,
  secondValue,
  tone,
  size = "sm",
}: AxisRatioCardProps) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-md border p-3 ${TINTED_TONE_CLASSES[tone]}`}>
      <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-text-2">{label}</div>
      <AxisRatioValue
        firstLabel={firstLabel}
        firstValue={firstValue}
        secondLabel={secondLabel}
        secondValue={secondValue}
        tone={tone}
        size={size}
      />
    </div>
  );
}
