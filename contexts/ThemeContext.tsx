"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { localPreferences } from "@/lib/local-preferences";

import type { ThemeMode } from "@/lib/local-preferences";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // ちらつきを避けるため、DOMの状態を初期値として使う
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });
  const [themeMode, setThemeModeState] = useState<ThemeMode>("auto");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // inline script が設定済みの値と状態を同期する
    const storedMode = localPreferences.getThemeMode();
    const mode = storedMode || "auto";
    setThemeModeState(mode);

    // 実際のテーマを設定
    if (mode === "auto") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    } else {
      setTheme(mode);
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      // Only auto-update if mode is "auto"
      if (themeMode !== "auto") return;
      const newTheme = event.matches ? "dark" : "light";
      setTheme(newTheme);
      document.documentElement.classList.toggle("dark", newTheme === "dark");
    };

    mediaQuery.addEventListener
      ? mediaQuery.addEventListener("change", handleChange)
      : mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeEventListener
        ? mediaQuery.removeEventListener("change", handleChange)
        : mediaQuery.removeListener(handleChange);
    };
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localPreferences.setThemeMode(mode);

    if (mode === "auto") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const autoTheme = prefersDark ? "dark" : "light";
      setTheme(autoTheme);
      document.documentElement.classList.toggle("dark", autoTheme === "dark");
    } else {
      setTheme(mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
    }
  };

  const toggleTheme = () => {
    // Cycle through: light → dark → auto → light
    const modeOrder: ThemeMode[] = ["light", "dark", "auto"];
    const currentIndex = modeOrder.indexOf(themeMode);
    const nextMode = modeOrder[(currentIndex + 1) % modeOrder.length];
    setThemeMode(nextMode);
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

const FALLBACK: ThemeContextType = {
  theme: "dark",
  themeMode: "auto",
  setThemeMode: () => {},
  toggleTheme: () => {},
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  // Return a safe fallback if called before ThemeProvider mounts
  return context ?? FALLBACK;
}
