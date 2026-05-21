import { formatPct, pctColor } from "@/lib/utils";

export default function ChangeCell({ value }: { value: number | null | undefined }) {
  return (
    <td
      className={`py-3 px-3 text-right font-mono-2 text-[12.5px] font-semibold tabular-nums ${pctColor(value)}`}
    >
      {formatPct(value)}
    </td>
  );
}
