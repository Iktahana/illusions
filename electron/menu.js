// Application menu construction and management
//
// The menu structure (sections, items, labels, ordering, default
// accelerators, checkbox-state mappings) is derived from the shared
// template in lib/menu/menu-template.js (#1433), which is also the source
// for the Web menu bar. Electron-only entries (macOS app menu, devtools,
// quit, window roles, update check) are added here.

const { app, BrowserWindow, Menu, shell } = require("electron");
const {
  MENU_TEMPLATE,
  SETTINGS_MENU_ITEM,
  formatVersionLabel,
  getNativeDefaultAccelerators,
} = require("../src/lib/menu/menu-template");
const { APP_NAME, isDev } = require("./app-constants");

// Default UI state for menu checked states
const DEFAULT_MENU_UI_STATE = {
  compactMode: false,
  showParagraphNumbers: true,
  themeMode: "auto", // 'auto' | 'light' | 'dark'
  autoCharsPerLine: true,
  hasActiveEditor: false,
};

// Per-window UI state (BrowserWindow.id → menuUiState object)
const windowMenuStates = new Map();

// Per-window keymap overrides (BrowserWindow.id → overrides object)
const windowKeymapOverrides = new Map();

// The ID of the currently focused window; used to select the correct per-window state
// when building the application menu.
let activeWindowId = null;

/**
 * Default Electron accelerator strings keyed by CommandId.
 * Derived from the shared menu template (single source with the Web menu).
 */
const DEFAULT_ACCELERATORS = getNativeDefaultAccelerators();

/**
 * Returns the UI state for the currently active window.
 * Falls back to the default state if no window state has been registered yet.
 * @returns {typeof DEFAULT_MENU_UI_STATE}
 */
function getMenuUiState() {
  if (activeWindowId !== null && windowMenuStates.has(activeWindowId)) {
    return windowMenuStates.get(activeWindowId);
  }
  return { ...DEFAULT_MENU_UI_STATE };
}

/**
 * Stores the UI state for a specific window.
 * @param {Partial<typeof DEFAULT_MENU_UI_STATE>} state
 * @param {number} windowId - BrowserWindow.id
 */
function setMenuUiState(state, windowId) {
  const existing = windowMenuStates.get(windowId) ?? { ...DEFAULT_MENU_UI_STATE };
  windowMenuStates.set(windowId, { ...existing, ...state });
}

/**
 * Returns the keymap overrides for the currently active window.
 * @returns {Record<string, unknown>}
 */
function getKeymapOverrides() {
  if (activeWindowId !== null && windowKeymapOverrides.has(activeWindowId)) {
    return windowKeymapOverrides.get(activeWindowId);
  }
  return {};
}

/**
 * Stores keymap overrides for a specific window.
 * @param {Record<string, unknown>} overrides
 * @param {number} windowId - BrowserWindow.id
 */
function setKeymapOverrides(overrides, windowId) {
  windowKeymapOverrides.set(windowId, overrides ?? {});
}

/**
 * Sets the active window ID so that subsequent menu builds reflect that window's state.
 * @param {number | null} windowId - BrowserWindow.id, or null to clear
 */
function setActiveWindowId(windowId) {
  activeWindowId = windowId;
}

/**
 * Removes all per-window state for a closed window.
 * @param {number} windowId - BrowserWindow.id
 */
function removeWindowState(windowId) {
  windowMenuStates.delete(windowId);
  windowKeymapOverrides.delete(windowId);
  if (activeWindowId === windowId) {
    activeWindowId = null;
  }
}

/**
 * Resolves the Electron accelerator for a command, applying user overrides.
 * @param {string} commandId
 * @returns {string | undefined}
 */
function resolveAccelerator(commandId) {
  const overrides = getKeymapOverrides();
  const override = overrides[commandId];
  if (override === null) return undefined; // intentionally unbound
  if (override) {
    // Convert KeyBinding { modifiers: [...], key: "s" } to "CmdOrCtrl+Shift+S"
    const keyMap = {
      Tab: "Tab",
      Escape: "Escape",
      Backspace: "Backspace",
      Delete: "Delete",
      Enter: "Return",
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
    };
    const key = keyMap[override.key] ?? override.key.toUpperCase();
    return [...override.modifiers, key].join("+");
  }
  return DEFAULT_ACCELERATORS[commandId];
}

/**
 * Builds the click handler for a shared template item, or undefined for
 * items without click semantics (separators, containers).
 * @param {import("../src/lib/menu/menu-template").MenuTemplateItem} item
 * @param {(channel: string, ...args: unknown[]) => void} sendToFocused
 * @returns {(() => void) | undefined}
 */
function buildClickHandler(item, sendToFocused) {
  if (item.electronHandler === "new-window") {
    return () => {
      // Defer require to avoid circular dependency with window-manager.js
      const { createWindow } = require("./window-manager");
      createWindow({ showWelcome: true });
    };
  }
  if (item.electronHandler === "open-settings-window") {
    return () => {
      const { createSettingsWindow } = require("./window-manager");
      void createSettingsWindow();
    };
  }
  if (item.electronOpenExternal) {
    const url = item.electronOpenExternal;
    return () => {
      shell.openExternal(url);
    };
  }
  if (item.electronChannel) {
    const channel = item.electronChannel;
    const args = item.electronArgs ?? [];
    return () => {
      sendToFocused(channel, ...args);
    };
  }
  return undefined;
}

/**
 * Converts a shared template item into an Electron menu template item.
 * @param {import("../src/lib/menu/menu-template").MenuTemplateItem} item
 * @param {{
 *   sendToFocused: (channel: string, ...args: unknown[]) => void,
 *   menuUiState: typeof DEFAULT_MENU_UI_STATE,
 *   recentProjects: Array<{ id: string, name: string }>,
 *   isSettingsWindow: boolean,
 * }} ctx
 * @returns {object}
 */
function toNativeMenuItem(item, ctx) {
  if (item.type === "separator") {
    return { type: "separator" };
  }

  const label = item.dynamicLabel === "version" ? formatVersionLabel(app.getVersion()) : item.label;

  // Role-based items delegate behavior to Electron (macOS conventions intact)
  if (item.electronRole) {
    return { role: item.electronRole, label };
  }

  /** @type {Record<string, unknown>} */
  const native = { label };

  // Settings is not an editor window: file/format/window commands must never
  // be delivered to its renderer. Native edit roles remain available for
  // text fields inside the settings UI.
  if (
    ctx.isSettingsWindow &&
    item.electronChannel &&
    item.electronHandler !== "open-settings-window"
  ) {
    native.enabled = false;
  }

  // Apply this before returning nested submenus so their parent menu item is
  // also unavailable while the welcome screen has no editor tab.
  if (item.requiresActiveEditor) {
    native.enabled = ctx.menuUiState.hasActiveEditor;
  }

  // Dynamic submenu insertion point: recent projects
  if (item.dynamicSubmenu === "recent-projects") {
    native.submenu =
      ctx.recentProjects.length > 0
        ? ctx.recentProjects.map((project) => ({
            label: project.name,
            click: () => {
              ctx.sendToFocused(item.electronChannel, project.id);
            },
          }))
        : [{ label: "項目なし", enabled: false }];
    return native;
  }

  if (item.submenu) {
    native.submenu = item.submenu.map((child) => toNativeMenuItem(child, ctx));
    return native;
  }

  // Accelerator: user keymap override (via commandId) > shared default
  if (item.commandId) {
    const accelerator = resolveAccelerator(item.commandId);
    if (accelerator) native.accelerator = accelerator;
  } else if (item.nativeAccelerator) {
    native.accelerator = item.nativeAccelerator;
  }

  // Checkbox / radio state mapped from the renderer-reported UI state
  if (item.checkedState) {
    native.type = item.electronType ?? item.type;
    const stateValue = ctx.menuUiState[item.checkedState.key];
    native.checked =
      item.checkedState.value !== undefined
        ? stateValue === item.checkedState.value
        : Boolean(stateValue);
  }

  if (item.enabledWhenNotState) {
    native.enabled = !ctx.menuUiState[item.enabledWhenNotState];
  }

  if (item.enabled === false) {
    native.enabled = false;
  }

  const click = buildClickHandler(item, ctx.sendToFocused);
  if (click) native.click = click;

  return native;
}

/** @param {import("../src/lib/menu/menu-template").MenuTemplateItem} item @param {boolean} isMac */
function isNativeItemVisible(item, isMac) {
  return item.electronPlatform !== "non-mac" || !isMac;
}

/**
 * Electron-only menu entries inserted around the shared core items.
 * @param {"file" | "edit" | "format" | "view" | "window" | "help"} sectionId
 * @param {boolean} isMac
 * @returns {{ prepend: object[], append: object[] }}
 */
function getElectronSectionExtras(sectionId, isMac) {
  switch (sectionId) {
    case "file":
      return {
        prepend: [],
        append: isMac ? [] : [{ type: "separator" }, { role: "quit", label: "終了" }],
      };
    case "view":
      return {
        prepend: [
          ...(isDev
            ? [
                { role: "reload", label: "再読み込み" },
                { role: "forceReload", label: "強制再読み込み" },
                { type: "separator" },
              ]
            : []),
          { role: "toggleDevTools", label: "開発者ツールを切り替え" },
        ],
        append: [
          { type: "separator" },
          { role: "togglefullscreen", label: "全画面表示を切り替え" },
        ],
      };
    case "window":
      return {
        prepend: [],
        append: [
          { type: "separator" },
          ...(isMac
            ? [
                { role: "minimize", label: "最小化" },
                { role: "zoom", label: "拡大/縮小" },
                { type: "separator" },
                { role: "front", label: "すべてを手前に移動" },
                { type: "separator" },
                { role: "window", label: "ウィンドウ" },
              ]
            : [{ role: "minimize", label: "最小化" }]),
        ],
      };
    case "help":
      return {
        prepend: [
          {
            label: "アップデートを確認",
            click: () => {
              // Defer require to avoid circular dependency with auto-updater.js
              const { checkForUpdates } = require("./auto-updater");
              checkForUpdates(true);
            },
          },
          { type: "separator" },
        ],
        append: [],
      };
    default:
      return { prepend: [], append: [] };
  }
}

/**
 * Builds the full native menu template from the shared menu template.
 * @param {Array<{ id: string, name: string }>} recentProjects
 * @param {string} platform - process.platform (injectable for tests)
 * @returns {object[]}
 */
function buildApplicationMenu(recentProjects = [], platform = process.platform) {
  const isMac = platform === "darwin";
  // Snapshot the active window's UI state once for this build
  const menuUiState = getMenuUiState();

  /** Send an IPC message to the focused window instead of mainWindow */
  const sendToFocused = (channel, ...args) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.webContents.send(channel, ...args);
  };

  const { isSettingsWindow } = require("./window-manager");
  const ctx = {
    sendToFocused,
    menuUiState,
    recentProjects,
    isSettingsWindow: isSettingsWindow(BrowserWindow.getFocusedWindow()),
  };
  const template = [];

  // アプリ（macOSのみ・role ベースの実装を維持）
  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: "about", label: `${APP_NAME}について` },
        { type: "separator" },
        { role: "services", label: "サービス" },
        { type: "separator" },
        // macOS convention: Settings belongs in the application menu, not File.
        toNativeMenuItem(SETTINGS_MENU_ITEM, ctx),
        { type: "separator" },
        { role: "hide", label: `${APP_NAME}を隠す` },
        { role: "hideOthers", label: "他を隠す" },
        { role: "unhide", label: "すべてを表示" },
        { type: "separator" },
        { role: "quit", label: `${APP_NAME}を終了` },
      ],
    });
  }

  for (const section of MENU_TEMPLATE) {
    const { prepend, append } = getElectronSectionExtras(section.id, isMac);
    template.push({
      label: section.label,
      submenu: [
        ...prepend,
        ...section.items
          .filter((item) => isNativeItemVisible(item, isMac))
          .map((item) => toNativeMenuItem(item, ctx)),
        ...append,
      ],
    });
  }

  return template;
}

/** Rebuild the application menu with fresh recent projects from SQLite */
async function rebuildApplicationMenu() {
  try {
    // Defer require so that menu construction stays importable without the
    // storage stack (also avoids loading better-sqlite3 in tests)
    const { getStorageManager } = require("./ipc/storage-ipc");
    const manager = getStorageManager();
    const projects = await manager.getRecentProjects();
    const menu = Menu.buildFromTemplate(buildApplicationMenu(projects));
    Menu.setApplicationMenu(menu);
  } catch (error) {
    console.error("[Main] Failed to rebuild menu:", error);
    // Fallback: build menu without recent projects
    const menu = Menu.buildFromTemplate(buildApplicationMenu());
    Menu.setApplicationMenu(menu);
  }
}

module.exports = {
  buildApplicationMenu,
  rebuildApplicationMenu,
  getMenuUiState,
  setMenuUiState,
  getKeymapOverrides,
  setKeymapOverrides,
  setActiveWindowId,
  removeWindowState,
};
