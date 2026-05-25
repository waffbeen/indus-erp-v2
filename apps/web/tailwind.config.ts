import type { Config } from "tailwindcss";
import indusPreset from "@indus/ui/tailwind-preset";

const config: Config = {
  presets: [indusPreset as Config],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/ui/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
