import { formatPct, pctColor } from "@/lib/utils";

export default function ChangeCell({ value }: { value: number | null | undefined }) {
  return (
    <td className={`py-3 px-3 text-right font-mono text-sm ${pctColor(value)}`}>
      {formatPct(value)}
    </td>
  );
}
