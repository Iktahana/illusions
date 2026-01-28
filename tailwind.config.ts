import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        ja: [
          "'Noto Serif JP'",
          "'Hiragino Mincho ProN'",
          "'Yu Mincho'",
          "'YuMincho'",
          "'serif'",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
