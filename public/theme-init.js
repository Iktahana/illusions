/**
 * Theme initialization script.
 * Runs before React hydration to prevent FOUC (Flash of Unstyled Content).
 * Reads the stored theme preference from localStorage and applies the dark
 * class to <html> synchronously so the correct theme is visible on first paint.
 *
 * Key: "illusions:theme-mode" — values: "light" | "dark" | "auto" | null
 */
(function () {
  try {
    var mode = localStorage.getItem("illusions:theme-mode");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark = mode === "dark" || (mode !== "light" && prefersDark);
    if (isDark) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {
    // localStorage may be unavailable (e.g. sandboxed iframe)
  }
})();
