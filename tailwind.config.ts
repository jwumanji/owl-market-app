import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Legacy (kept during migration) ──
        void: "var(--void)",
        deep: "var(--deep)",
        surface: "var(--surface)",
        surf2: "var(--surf2)",
        surf3: "var(--surf3)",
        border: "var(--border)",
        "border-2": "var(--border2)",
        owl: "var(--owl)",
        "owl-light": "var(--owl2)",
        gain: "var(--green)",
        loss: "var(--red)",
        blue: "var(--blue)",
        purple: "var(--purple)",
        text: "var(--text)",
        "text-2": "var(--text2)",
        "text-3": "var(--text3)",

        // ── C1.5 (introduced in Stage A) ──
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        "bg-3": "var(--bg-3)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        pink: "var(--pink)",
        coral: "var(--coral)",
        gold: "var(--gold)",
        "gain-2": "var(--gain-2)",
        "loss-2": "var(--loss-2)",
        // ── C1.5 Stage B additions ──
        select: "var(--select)",
        "grade-10": "var(--grade-10)",
        "grade-9": "var(--grade-9)",
        "grade-8b": "var(--grade-8b)",
        "grade-8": "var(--grade-8)",
        "grade-7": "var(--grade-7)",
        "grade-low": "var(--grade-low)",
      },
      fontFamily: {
        // ── Legacy ──
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
        // ── C1.5 ──
        grotesk: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        script: ["var(--font-caveat)", "cursive"],
        "mono-2": ["var(--font-jetbrains-mono)", "monospace"],
      },
      backgroundImage: {
        "grad-brand": "var(--grad-brand)",
      },
      borderRadius: {
        "c-sm": "var(--r-sm)",
        "c-md": "var(--r-md)",
        "c-lg": "var(--r-lg)",
        "c-pill": "var(--r-pill)",
      },
    },
  },
  plugins: [],
};
export default config;
