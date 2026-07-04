"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

function fmtUsd(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function SetChart({
  points,
  color,
}: {
  points: { x: string; y: number }[];
  color: string;
}) {
  const chartData: ChartData<"line"> = useMemo(() => ({
    labels: points.map((p) => p.x),
    datasets: [
      {
        data: points.map((p) => p.y),
        borderColor: color,
        borderWidth: 1.8,
        fill: true,
        backgroundColor: (ctx) => {
          const chart = ctx.chart;
          const { chartArea } = chart;
          if (!chartArea) return hexToRgba(color, 0.1);
          const g = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, hexToRgba(color, 0.28));
          g.addColorStop(1, hexToRgba(color, 0));
          return g;
        },
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
      },
    ],
  }), [points, color]);

  const chartOptions: ChartOptions<"line"> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 10, right: 8, bottom: 6, left: 6 } },
    interaction: { mode: "index", intersect: false },
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
        callbacks: { label: (item) => `  ${fmtUsd(Number(item.parsed.y))}` },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(26,15,8,0.06)" },
        ticks: { font: { family: "JetBrains Mono", size: 10 }, color: "#9A8475", maxTicksLimit: 6, maxRotation: 0 },
        border: { display: false },
      },
      y: {
        position: "right",
        grid: { color: "rgba(26,15,8,0.06)" },
        ticks: { font: { family: "JetBrains Mono", size: 10 }, color: "#9A8475", callback: (v) => "$" + Number(v).toLocaleString() },
        border: { display: false },
      },
    },
  }), []);

  return <Line data={chartData} options={chartOptions} />;
}
