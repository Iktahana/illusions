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
          DEFAULT: "var(--background)",
          secondary: "var(--background-secondary)",
          tertiary: "var(--background-tertiary)",
          elevated: "var(--background-elevated)",
        },
        foreground: {
          DEFAULT: "var(--foreground)",
          secondary: "var(--foreground-secondary)",
          tertiary: "var(--foreground-tertiary)",
          muted: "var(--foreground-muted)",
        },
        border: {
          DEFAULT: "var(--border)",
          secondary: "var(--border-secondary)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
          light: "var(--accent-light)",
          hover: "var(--accent-hover)",
        },
        hover: "var(--hover)",
        active: "var(--active)",
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        info: "var(--info)",
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
