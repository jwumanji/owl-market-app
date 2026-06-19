"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { PricePoint } from "./card-detail-types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type Period = "7d" | "1m" | "3m" | "1y" | "max";

function formatDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  if (period === "1y" || period === "max") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PriceChartClient({
  data,
  period,
}: {
  data: PricePoint[];
  period: Period;
}) {
  const chartData = {
    labels: data.map((p) => formatDate(p.recorded_at, period)),
    datasets: [
      {
        data: data.map((p) => p.market_avg),
        borderColor: "#2D9961",
        borderWidth: 1.8,
        fill: true,
        backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
          const { ctx: c, chartArea } = ctx.chart;
          if (!chartArea) return "rgba(45,153,97,0.05)";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, "rgba(45,153,97,0.20)");
          g.addColorStop(1, "rgba(45,153,97,0.02)");
          return g;
        },
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: "#2D9961",
        pointBorderColor: "#FFFFFF",
        pointBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 12, right: 12, bottom: 8, left: 8 } },
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(26,15,8,0.95)",
        borderColor: "rgba(26,15,8,0.10)",
        borderWidth: 1,
        titleFont: { family: "JetBrains Mono", size: 10 },
        bodyFont: { family: "JetBrains Mono", size: 11 },
        titleColor: "#9A8475",
        bodyColor: "#FFF5E4",
        padding: 10,
        callbacks: {
          label: (v: { parsed: { y: number | null } }) =>
            `  $${(v.parsed.y ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(26,15,8,0.06)" },
        ticks: {
          font: { family: "JetBrains Mono", size: 10 },
          color: "#9A8475",
          maxTicksLimit: 8,
          maxRotation: 0,
        },
        border: { display: false },
      },
      y: {
        position: "right" as const,
        grid: { color: "rgba(26,15,8,0.06)" },
        ticks: {
          font: { family: "JetBrains Mono", size: 10 },
          color: "#9A8475",
          callback: (v: number | string) => "$" + Number(v).toLocaleString(),
        },
        border: { display: false },
      },
    },
  };

  return <Line data={chartData} options={options} />;
}
