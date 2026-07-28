"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

// ---------------------------------------------------------------------------
// SealedPriceChart — the chart.js render, split out of SealedDetailClient so
// the chart.js payload leaves the page's initial client bundle. Loaded via
// next/dynamic (ssr: false): hydration no longer contends with the hero
// image's decode/paint on throttled mobile, which was the detail page's LCP
// render delay (docs/investigations/lcp-diagnosis.md, cause 2). The parent
// .sd-chart-canvas has a fixed height, so the late mount cannot shift layout.
// Register at module scope with only the elements this chart needs, per the
// SetChartClient / PriceChartClient pattern.
// ---------------------------------------------------------------------------

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export default function SealedPriceChart({
  data,
  options,
}: {
  data: ChartData<"line">;
  options: ChartOptions<"line">;
}) {
  return <Line data={data} options={options} />;
}
