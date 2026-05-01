/**
 * Settings tab categories used by `<SettingsModal>` and its callers.
 */
export type SettingsCategory =
  | "account"
  | "ai-connection"
  | "typography"
  | "scroll"
  | "pos-highlight"
  | "linting"
  | "speech"
  | "keymap"
  | "terminal"
  | "power"
  | "dictionary"
  | "about";

/**
 * Normalize a (potentially undefined) category to a safe default, and fall
 * back to `"account"` when a category is not available in the current
 * runtime (e.g. an Electron-only tab was requested in the Web build).
 */
export function resolveLegacyCategory(
  category: SettingsCategory | undefined,
  options: { isElectron: boolean } = { isElectron: true },
): SettingsCategory {
  const normalized: SettingsCategory = category ?? "typography";
  if (!options.isElectron && (normalized === "terminal" || normalized === "power")) {
    return "account";
  }
  return normalized;
}
