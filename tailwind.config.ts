import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "rgb(var(--background) / <alpha-value>)",
          secondary: "rgb(var(--background-secondary) / <alpha-value>)",
          tertiary: "rgb(var(--background-tertiary) / <alpha-value>)",
          elevated: "rgb(var(--background-elevated) / <alpha-value>)",
        },
        foreground: {
          DEFAULT: "rgb(var(--foreground) / <alpha-value>)",
          secondary: "rgb(var(--foreground-secondary) / <alpha-value>)",
          tertiary: "rgb(var(--foreground-tertiary) / <alpha-value>)",
          muted: "rgb(var(--foreground-muted) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          secondary: "rgb(var(--border-secondary) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
          light: "rgb(var(--accent-light) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
        },
        hover: "rgb(var(--hover) / <alpha-value>)",
        active: "rgb(var(--active) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
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
