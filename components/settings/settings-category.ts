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
  | "privacy"
  | "about";

/** Settings that do not depend on an open document/project. */
export const GLOBAL_SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  "account",
  "ai-connection",
  "typography",
  "scroll",
  "dictionary",
  "keymap",
  "speech",
  "terminal",
  "power",
  "privacy",
  "about",
];

export type SettingsScope = "all" | "global";

export function isCategoryInScope(category: SettingsCategory, scope: SettingsScope): boolean {
  return scope === "all" || GLOBAL_SETTINGS_CATEGORIES.includes(category);
}

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
  if (
    !options.isElectron &&
    (normalized === "terminal" || normalized === "power" || normalized === "privacy")
  ) {
    return "account";
  }
  return normalized;
}
