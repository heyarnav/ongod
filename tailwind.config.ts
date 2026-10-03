import type { Config } from "tailwindcss";

/**
 * on god. — archive design tokens
 * Dark charcoal field, bone ink, restrained crimson for observation.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#131210",
        abyss: "#0D0C0A",
        graphite: "#1A1916",
        charcoal: "#1F1D19",
        bone: { DEFAULT: "#D8D1C5", dim: "#98938A", faint: "#6E6A5F" },
        crimson: { DEFAULT: "#7F1518", bright: "#9c2024", ember: "#641114" },
      },
      fontFamily: {
        serif: ["var(--font-cormorant)", "Georgia", "serif"],
        mono: ["var(--font-jbm)", "ui-monospace", "monospace"],
        black: ["var(--font-unifraktur)", "var(--font-cormorant)", "serif"],
      },
      letterSpacing: {
        archive: "0.32em",
      },
      animation: {
        "pulse-slow": "pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
