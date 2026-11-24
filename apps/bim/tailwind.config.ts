import type { Config } from "tailwindcss";
import preset from "../../packages/ui/tailwind-preset";

const config: Config = {
  presets: [preset as Partial<Config>],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./config/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  plugins: [],
};

export default config;
