/**
 * Lazily access the Electron preload bridge.
 *
 * Keeping the lookup inside these functions makes this module safe to import
 * during SSR, static builds, and Node-based tooling where `window` is absent.
 */

type ElectronRendererAPI = NonNullable<Window["electronAPI"]>;

const ELECTRON_API_UNAVAILABLE_MESSAGE =
  "Electron preload bridge is unavailable: window.electronAPI was not exposed. " +
  "Ensure the Electron preload script is configured and loaded before using Electron-only features.";

/**
 * Return the Electron preload bridge when it is available.
 *
 * This is intentionally non-throwing so callers can probe the runtime without
 * coupling module evaluation to a browser or Electron environment.
 */
export function getElectronAPI(): ElectronRendererAPI | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.electronAPI ?? null;
}

/**
 * Return the Electron preload bridge or fail with an actionable error.
 *
 * Use this at Electron-only operation boundaries where continuing without the
 * preload bridge would hide a packaging or preload configuration problem.
 */
export function requireElectronAPI(): ElectronRendererAPI {
  const electronAPI = getElectronAPI();

  if (!electronAPI) {
    throw new Error(ELECTRON_API_UNAVAILABLE_MESSAGE);
  }

  return electronAPI;
}
