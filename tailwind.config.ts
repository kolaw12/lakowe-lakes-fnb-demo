import type { Config } from "tailwindcss";
import { COLORS } from "./lib/constants";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: COLORS.forest,
        bronze: COLORS.bronze,
        cream: COLORS.cream,
        charcoal: COLORS.charcoal,
        "grey-light": COLORS.greyLight,
        brand: { navy: "#172B42", gold: "#C5A56A", warm: "#FAF9F6", silver: "#E7EBED", slate: "#2F3A45" },
      },
      fontFamily: {
        sans: ["var(--font-montserrat)", "Montserrat", "sans-serif"],
        serif: ["var(--font-montserrat)", "Montserrat", "sans-serif"],
        inter: ["var(--font-montserrat)", "Montserrat", "sans-serif"],
        montserrat: ["var(--font-montserrat)", "Montserrat", "sans-serif"],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      minHeight: {
        touch: "48px",
      },
    },
  },
  plugins: [],
};

export default config;
