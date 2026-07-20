import type { CommandId } from "./command-ids";

/**
 * A key binding consisting of modifier keys and a primary key.
 * Uses Electron-compatible modifier names.
 */
export interface KeyBinding {
  modifiers: Array<"CmdOrCtrl" | "Shift" | "Alt" | "Ctrl">;
  key: string;
}

/**
 * Category for grouping shortcuts in the settings UI.
 */
export type ShortcutCategory = "file" | "edit" | "format" | "view" | "nav" | "panel" | "app";

/**
 * A single entry in the shortcut registry.
 */
export interface ShortcutEntry {
  id: CommandId;
  /** Japanese display label */
  label: string;
  category: ShortcutCategory;
  defaultBinding: KeyBinding | null;
  /** Platform scope for this shortcut */
  scope: "all" | "electron-only" | "web-only";
}

/**
 * User-defined overrides: only differences from defaults are stored.
 * A null value means the shortcut is intentionally unbound.
 */
export type KeymapOverrides = Partial<Record<CommandId, KeyBinding | null>>;
