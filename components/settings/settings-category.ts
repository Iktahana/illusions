/**
 * Settings tab categories used by `<SettingsModal>` and its callers.
 *
 * Legacy values (`"ai-api"`, `"editor"`, `"vertical"`) are kept during the
 * nav refactor so that external call-sites (deeplinks, `use-panel-state`)
 * continue to work. `resolveLegacyCategory` normalizes them to the current
 * names. Legacy values will be removed in the cleanup phase (P6).
 */
export type SettingsCategory =
  // Current names
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
  | "about"
  // Legacy aliases (deprecated, removed in P6)
  | "ai-api"
  | "editor"
  | "vertical";

/**
 * Current (non-legacy) subset of `SettingsCategory`. Used as the canonical
 * storage shape inside the modal.
 */
export type ResolvedSettingsCategory = Exclude<
  SettingsCategory,
  "ai-api" | "editor" | "vertical"
>;

/**
 * Map legacy category names to their current equivalents, and fall back to
 * `"account"` when a category is not available in the current runtime (e.g.
 * an Electron-only tab was requested in the Web build).
 */
export function resolveLegacyCategory(
  category: SettingsCategory | undefined,
  options: { isElectron: boolean } = { isElectron: true },
): ResolvedSettingsCategory {
  const normalized: ResolvedSettingsCategory = (() => {
    switch (category) {
      case "ai-api":
        return "ai-connection";
      case "editor":
        return "typography";
      case "vertical":
        return "scroll";
      case undefined:
        return "typography";
      default:
        return category;
    }
  })();

  if (!options.isElectron && (normalized === "terminal" || normalized === "power")) {
    return "account";
  }
  return normalized;
}
