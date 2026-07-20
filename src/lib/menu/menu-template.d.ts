/**
 * Type declarations for the shared menu template (#1433).
 * See menu-template.js for the data and rationale.
 */
import type { CommandId } from "../keymap/command-ids";

/** Renderer-reported UI state keys used for checkbox/radio menu items. */
export type MenuStateKey = "compactMode" | "showParagraphNumbers" | "autoCharsPerLine";

/** Mapping between a checkbox/radio item and the renderer UI state. */
export interface MenuCheckedBinding {
  /** Key in the menu UI state object */
  key: MenuStateKey | "themeMode";
  /** For radio-like bindings: checked when state[key] === value */
  value?: string;
}

export interface MenuTemplateItem {
  /** Stable item id; doubles as the Web menu action string */
  id?: string;
  type?: "separator" | "checkbox";
  /** Japanese display label (shared by Web and Electron) */
  label?: string;
  /** Items whose label is computed at build time (see formatVersionLabel) */
  dynamicLabel?: "version";
  /** Keymap command backing this item (user override resolution) */
  commandId?: CommandId;
  /** When false, the Web menu keeps its static accelerator (no override lookup) */
  webCommandLookup?: false;
  /** Default native (Electron) accelerator; user overrides take precedence */
  nativeAccelerator?: string;
  /** Static Web accelerator display string */
  webAccelerator?: string | { mac: string; other: string };
  /** When false, omit this native-only item from the Web menu bar. */
  webVisible?: false;
  /** Restrict a native item to non-macOS desktop platforms. */
  electronPlatform?: "non-mac";
  /** Electron menu role (platform-native behavior, e.g. undo/copy/zoom) */
  electronRole?: string;
  /** IPC channel sent to the focused window when clicked (Electron) */
  electronChannel?: string;
  /** Extra arguments sent with electronChannel */
  electronArgs?: string[];
  /** Electron main-process special handler id */
  electronHandler?: "new-window";
  /** External URL opened by the Electron main process when clicked */
  electronOpenExternal?: string;
  /** Electron item type override (theme items are radio natively) */
  electronType?: "radio";
  /** Checked-state mapping for checkbox/radio items */
  checkedState?: MenuCheckedBinding;
  /** Electron-only: item is enabled while state[key] is falsy */
  enabledWhenNotState?: MenuStateKey;
  /** Static enabled flag (e.g. version info row) */
  enabled?: false;
  /** Marker for dynamically generated submenus */
  dynamicSubmenu?: "recent-projects";
  submenu?: MenuTemplateItem[];
}

export interface MenuTemplateSection {
  id: "file" | "edit" | "format" | "view" | "window" | "help";
  /** Japanese menu bar label */
  label: string;
  items: MenuTemplateItem[];
}

export declare const MENU_TEMPLATE: MenuTemplateSection[];
/** Native Settings item, placed in File on non-macOS and the app menu on macOS. */
export declare const SETTINGS_MENU_ITEM: MenuTemplateItem;

/** Shared label format for the version info row in the help menu. */
export declare function formatVersionLabel(version: string): string;

/** Visits every item (including nested submenus) in the shared template. */
export declare function forEachTemplateItem(visit: (item: MenuTemplateItem) => void): void;

/**
 * Default Electron accelerator strings keyed by CommandId, derived from the
 * shared template.
 */
export declare function getNativeDefaultAccelerators(): Partial<Record<CommandId, string>>;
