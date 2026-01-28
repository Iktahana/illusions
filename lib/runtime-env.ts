// Runtime environment detection helpers.
// Comments in code must be in English.

export type RuntimeEnvironment = "browser" | "electron-renderer" | "unknown";

/**
 * Detect whether code is running in a browser-like environment.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Detect whether code is running inside an Electron renderer process.
 * This relies on the preload script exposing `window.electronAPI`.
 */
export function isElectronRenderer(): boolean {
  return (
    isBrowser() &&
    typeof window.electronAPI !== "undefined" &&
    window.electronAPI.isElectron === true
  );
}

/**
 * Get the current runtime environment as a discriminated union.
 */
export function getRuntimeEnvironment(): RuntimeEnvironment {
  if (isElectronRenderer()) {
    return "electron-renderer";
  }
  if (isBrowser()) {
    return "browser";
  }
  return "unknown";
}

