/**
 * Typed facade for localStorage-based UI preferences.
 *
 * These values are read synchronously on mount to prevent visual flash,
 * which is why they use localStorage instead of the async StorageService.
 */

const PREFIX = "illusions:" as const

const KEYS = {
  themeMode: `${PREFIX}theme-mode`,
  writingMode: `${PREFIX}writing-mode`,
  leftTab: `${PREFIX}left-tab`,
  rightTab: `${PREFIX}right-tab`,
  sidebarTopOrder: `${PREFIX}sidebar-top-order`,
  sidebarBottomOrder: `${PREFIX}sidebar-bottom-order`,
} as const

// One-time migration from old keys to new keys
function migrateOldKeys(): void {
  if (typeof window === "undefined") return
  const migrations: [string, string][] = [
    ["themeMode", KEYS.themeMode],
    ["illusions-writing-mode", KEYS.writingMode],
    ["illusions:leftTab", KEYS.leftTab],
    ["illusions:rightTab", KEYS.rightTab],
    // These old keys already match the new keys, so no migration needed:
    // "illusions:sidebar-top-order" === KEYS.sidebarTopOrder
    // "illusions:sidebar-bottom-order" === KEYS.sidebarBottomOrder
  ]
  for (const [oldKey, newKey] of migrations) {
    if (oldKey === newKey) continue
    const value = localStorage.getItem(oldKey)
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value)
      localStorage.removeItem(oldKey)
    }
  }
}

// Run migration on first import
migrateOldKeys()

function get(key: string): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(key)
}

function set(key: string, value: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(key, value)
}

export type ThemeMode = "light" | "dark" | "auto"
export type WritingMode = "vertical" | "horizontal"

export const localPreferences = {
  // --- Theme ---
  getThemeMode(): ThemeMode | null {
    return get(KEYS.themeMode) as ThemeMode | null
  },
  setThemeMode(mode: ThemeMode): void {
    set(KEYS.themeMode, mode)
  },

  // --- Writing mode ---
  getWritingMode(): WritingMode | null {
    return get(KEYS.writingMode) as WritingMode | null
  },
  setWritingMode(mode: WritingMode): void {
    set(KEYS.writingMode, mode)
  },

  // --- Left sidebar tab ---
  getLeftTab(): string | null {
    return get(KEYS.leftTab)
  },
  setLeftTab(tab: string): void {
    set(KEYS.leftTab, tab)
  },

  // --- Right panel tab ---
  getRightTab(): string | null {
    return get(KEYS.rightTab)
  },
  setRightTab(tab: string): void {
    set(KEYS.rightTab, tab)
  },

  // --- Sidebar icon order ---
  getSidebarTopOrder(): string[] | null {
    const raw = get(KEYS.sidebarTopOrder)
    if (!raw) return null
    try { return JSON.parse(raw) as string[] } catch { return null }
  },
  setSidebarTopOrder(ids: string[]): void {
    set(KEYS.sidebarTopOrder, JSON.stringify(ids))
  },

  getSidebarBottomOrder(): string[] | null {
    const raw = get(KEYS.sidebarBottomOrder)
    if (!raw) return null
    try { return JSON.parse(raw) as string[] } catch { return null }
  },
  setSidebarBottomOrder(ids: string[]): void {
    set(KEYS.sidebarBottomOrder, JSON.stringify(ids))
  },
} as const
