/**
 * All command IDs used in the keymap registry.
 * This is the single source of truth for command identifiers.
 */
export type CommandId =
  // File operations
  | "file.save"
  | "file.saveAs"
  | "file.open"
  | "file.print"
  | "file.newWindow"
  | "file.newTab"
  | "file.closeTab"
  // Edit operations
  | "edit.undo"
  | "edit.redo"
  | "edit.pasteAsPlaintext"
  | "edit.selectAll"
  // View operations
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.resetZoom"
  | "view.compactMode"
  | "view.splitRight"
  | "view.splitDown"
  // Navigation
  | "nav.nextTab"
  | "nav.prevTab"
  | "nav.tab1"
  | "nav.tab2"
  | "nav.tab3"
  | "nav.tab4"
  | "nav.tab5"
  | "nav.tab6"
  | "nav.tab7"
  | "nav.tab8"
  | "nav.tab9"
  | "nav.settings"
  | "nav.search"
  // Panel toggles
  | "panel.explorer"
  | "panel.search"
  // | "panel.outline" // TODO: Outline feature — planned for v1.3.0
  // Format operations
  | "format.ruby"
  | "format.tcy";

export const ALL_COMMAND_IDS: CommandId[] = [
  "file.save",
  "file.saveAs",
  "file.open",
  "file.print",
  "file.newWindow",
  "file.newTab",
  "file.closeTab",
  "edit.undo",
  "edit.redo",
  "edit.pasteAsPlaintext",
  "edit.selectAll",
  "view.zoomIn",
  "view.zoomOut",
  "view.resetZoom",
  "view.compactMode",
  "view.splitRight",
  "view.splitDown",
  "nav.nextTab",
  "nav.prevTab",
  "nav.tab1",
  "nav.tab2",
  "nav.tab3",
  "nav.tab4",
  "nav.tab5",
  "nav.tab6",
  "nav.tab7",
  "nav.tab8",
  "nav.tab9",
  "nav.settings",
  "nav.search",
  "panel.explorer",
  "panel.search",
  // "panel.outline", // TODO: Outline feature — planned for v1.3.0
  "format.ruby",
  "format.tcy",
];
