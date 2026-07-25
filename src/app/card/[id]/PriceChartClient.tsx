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
  const hasDistinctAverage = data.some(
    (point) => Math.abs(point.market_avg - point.tcg_market) > 0.01
  );
  const chartData = {
    labels: data.map((p) => formatDate(p.recorded_at, period)),
    datasets: [
      {
        label: "TCG market quote",
        data: data.map((p) => p.tcg_market),
        borderColor: "#FF4936",
        borderWidth: 2.2,
        fill: true,
        backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
          const { ctx: c, chartArea } = ctx.chart;
          if (!chartArea) return "rgba(255,73,54,0.06)";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, "rgba(255,73,54,0.22)");
          g.addColorStop(1, "rgba(255,73,54,0.01)");
          return g;
        },
        tension: 0.28,
        pointRadius: data.length <= 14 ? 2.8 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: "#FF4936",
        pointBorderColor: "#FFFFFF",
        pointBorderWidth: 2,
      },
      ...(hasDistinctAverage
        ? [
            {
              label: "Rolling market average",
              data: data.map((p) => p.market_avg),
              borderColor: "#1F47A1",
              borderWidth: 1.6,
              borderDash: [6, 5],
              fill: false,
              tension: 0.28,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointBackgroundColor: "#1F47A1",
              pointBorderColor: "#FFFFFF",
              pointBorderWidth: 2,
            },
          ]
        : []),
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 12, right: 12, bottom: 8, left: 8 } },
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        display: hasDistinctAverage,
        position: "bottom" as const,
        labels: {
          color: "#5C4534",
          boxWidth: 18,
          boxHeight: 2,
          padding: 18,
          font: { family: "JetBrains Mono", size: 10 },
        },
      },
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
          label: (v: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            ` ${v.dataset.label ?? "Price"}: $${(v.parsed.y ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(26,15,8,0.055)" },
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
        grid: { color: "rgba(26,15,8,0.055)" },
        ticks: {
          font: { family: "JetBrains Mono", size: 10 },
          color: "#9A8475",
          callback: (v: number | string) => {
            const value = Number(v);
            if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
            return "$" + value.toLocaleString();
          },
        },
        border: { display: false },
      },
    },
  };

  return <Line data={chartData} options={options} />;
}
