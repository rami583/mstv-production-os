import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        glow: "0 20px 80px rgba(6, 8, 12, 0.45)",
        soft: "0 18px 55px rgba(0, 0, 0, 0.22)",
      },
    },
  },
  plugins: [],
};

export default config;
