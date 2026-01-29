"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize theme from what's already set in the DOM to avoid flash
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Sync state with what's already in the DOM (set by inline script)
    const stored = localStorage.getItem("theme") as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = stored || (prefersDark ? "dark" : "light");
    setTheme(initialTheme);
    // DOM class is already set by inline script, no need to set again
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const stored = localStorage.getItem("theme");
      if (stored) return;
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
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
