import type { Config } from "tailwindcss";
import preset from "../../packages/ui/tailwind-preset";

const config: Config = {
  presets: [preset as Partial<Config>],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: { DEFAULT: "6px", md: "8px", lg: "10px", xl: "14px" },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.03), 0 4px 16px -6px rgb(15 23 42 / 0.06)",
        "card-hover": "0 2px 4px rgb(15 23 42 / 0.04), 0 12px 28px -10px rgb(15 23 42 / 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
