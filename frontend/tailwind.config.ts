import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0A0D13",
          900: "#0D1117",
          800: "#141A24",
          700: "#1B2230",
          600: "#232B3A",
          500: "#333E52",
        },
        signal: {
          DEFAULT: "#E8A33D",
          dim: "#B87F2B",
        },
        market: {
          up: "#3FB88F",
          down: "#E8615D",
        },
        ash: {
          50: "#E7EAF1",
          200: "#C3C9D6",
          400: "#8892A6",
          600: "#5B6478",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "4px",
        sm: "3px",
        md: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
