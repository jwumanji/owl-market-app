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
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
