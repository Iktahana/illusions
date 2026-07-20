/**
 * Menu definitions for Web menu bar
 * Derived from the shared template in lib/menu/menu-template.ts (#1433),
 * which is also the source for the Electron native menu (electron/menu.js).
 */
import { isMacOS } from "@/lib/utils/runtime-env";
import { MENU_TEMPLATE, formatVersionLabel, forEachTemplateItem } from "./menu-template";

import type { MenuTemplateItem } from "./menu-template";
import type { CommandId } from "@/lib/keymap/command-ids";

const APP_VERSION = (() => {
  const v = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const parts = v.split(".");
  if (parts.length >= 3 && parts[2] !== "0") return v;
  return parts.slice(0, 2).join(".");
})();

export interface MenuItem {
  label?: string;
  type?: "normal" | "separator" | "checkbox";
  accelerator?: string;
  action?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
}

export interface MenuSection {
  label: string;
  items: MenuItem[];
}

/** Resolves the static Web accelerator display string for a template item. */
function resolveWebAccelerator(item: MenuTemplateItem): string | undefined {
  if (!item.webAccelerator) return undefined;
  if (typeof item.webAccelerator === "string") return item.webAccelerator;
  return isMacOS() ? item.webAccelerator.mac : item.webAccelerator.other;
}

/** Converts a shared template item into the Web menu item shape. */
function toWebMenuItem(item: MenuTemplateItem): MenuItem {
  if (item.type === "separator") {
    return { type: "separator" };
  }

  const result: MenuItem = {
    label: item.dynamicLabel === "version" ? formatVersionLabel(APP_VERSION) : item.label,
  };

  if (item.type === "checkbox") result.type = "checkbox";

  const accelerator = resolveWebAccelerator(item);
  if (accelerator) result.accelerator = accelerator;

  if (item.enabled === false) result.enabled = false;

  if (item.dynamicSubmenu) {
    // Dynamic submenus (recent projects) are injected at runtime by WebMenuBar;
    // the action id doubles as the injection marker.
    result.action = item.id;
    result.submenu = [];
  } else if (item.submenu) {
    // Static submenu containers carry no action of their own
    result.submenu = item.submenu.map(toWebMenuItem);
  } else if (item.enabled !== false && item.id) {
    result.action = item.id;
  }

  return result;
}

export const WEB_MENU_STRUCTURE: MenuSection[] = MENU_TEMPLATE.map((section) => ({
  label: section.label,
  items: section.items.filter((item) => item.webVisible !== false).map(toWebMenuItem),
}));

/**
 * Maps menu action strings to their corresponding CommandIds in the keymap registry.
 * Used by WebMenuBar to inject dynamic accelerator strings from user overrides.
 * Derived from the shared template (items flagged webCommandLookup: false keep
 * their static accelerator, e.g. print).
 */
export const ACTION_TO_COMMAND_ID: Partial<Record<string, CommandId>> = (() => {
  const map: Partial<Record<string, CommandId>> = {};
  forEachTemplateItem((item) => {
    if (item.webVisible !== false && item.id && item.commandId && item.webCommandLookup !== false) {
      map[item.id] = item.commandId;
    }
  });
  return map;
})();

/**
 * Format accelerator for display
 * Mac: Shows ⌘, ⇧, ⌥
 * Other: Shows Ctrl, Shift, Alt
 */
export function formatAccelerator(accelerator: string): string {
  if (typeof navigator === "undefined") {
    return accelerator;
  }

  const isMac = isMacOS();

  if (isMac) {
    return accelerator
      .replace(/Ctrl\+/g, "⌘")
      .replace(/Shift\+/g, "⇧")
      .replace(/Alt\+/g, "⌥");
  }

  return accelerator;
}
