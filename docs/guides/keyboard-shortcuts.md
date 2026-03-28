# Keyboard Shortcuts Reference

## Overview

illusions supports keyboard shortcuts across both Electron (desktop) and Web environments. Shortcuts are defined in `lib/menu-definitions.ts` and handled by `lib/editor-page/use-keyboard-shortcuts.ts`. The menu system uses Japanese labels for all user-facing items.

---

## Complete Shortcut Table

### File Operations

| Shortcut (macOS) | Shortcut (Windows) | Action | Japanese Label | Context |
|---|---|---|---|---|
| Cmd+N | Ctrl+N | New window | 新規ウィンドウ | Global |
| Cmd+O | Ctrl+O | Open file | 開く | Global |
| Cmd+S | Ctrl+S | Save | 保存 | Global |
| Shift+Cmd+S | Shift+Ctrl+S | Save as | 名前を付けて保存 | Global |
| Cmd+W | Ctrl+W | Close tab | タブを閉じる | Global |

### Tab Management (Electron Only)

| Shortcut (macOS) | Shortcut (Windows) | Action | Japanese Label | Context |
|---|---|---|---|---|
| Cmd+T | Ctrl+T | New tab | 新しいタブ | Electron only |
| Cmd+1 | Ctrl+1 | Switch to tab 1 | タブ1に切り替え | Electron only |
| Cmd+2 | Ctrl+2 | Switch to tab 2 | タブ2に切り替え | Electron only |
| Cmd+3 | Ctrl+3 | Switch to tab 3 | タブ3に切り替え | Electron only |
| Cmd+4 | Ctrl+4 | Switch to tab 4 | タブ4に切り替え | Electron only |
| Cmd+5 | Ctrl+5 | Switch to tab 5 | タブ5に切り替え | Electron only |
| Cmd+6 | Ctrl+6 | Switch to tab 6 | タブ6に切り替え | Electron only |
| Cmd+7 | Ctrl+7 | Switch to tab 7 | タブ7に切り替え | Electron only |
| Cmd+8 | Ctrl+8 | Switch to tab 8 | タブ8に切り替え | Electron only |
| Cmd+9 | Ctrl+9 | Switch to last tab | 最後のタブに切り替え | Electron only |

### Editing

| Shortcut (macOS) | Shortcut (Windows) | Action | Japanese Label | Context |
|---|---|---|---|---|
| Cmd+Z | Ctrl+Z | Undo | 元に戻す | Editor |
| Cmd+Y / Shift+Cmd+Z | Ctrl+Y | Redo | やり直す | Editor |
| Cmd+X | Ctrl+X | Cut | 切り取り | Editor |
| Cmd+C | Ctrl+C | Copy | コピー | Editor |
| Cmd+V | Ctrl+V | Paste | 貼り付け | Editor |
| Shift+Cmd+V | Shift+Ctrl+V | Paste as plain text | プレーンテキストとして貼り付け | Editor |
| Cmd+A | Ctrl+A | Select all | すべて選択 | Editor |
| Cmd+F | Ctrl+F | Find | 検索 | Editor |

### Formatting

| Shortcut (macOS) | Shortcut (Windows) | Action | Japanese Label | Context |
|---|---|---|---|---|
| Shift+Cmd+R | Shift+Ctrl+R | Ruby annotation | ルビ | Editor (requires selection) |

### View Controls

| Shortcut (macOS) | Shortcut (Windows) | Action | Japanese Label | Context |
|---|---|---|---|---|
| Cmd+0 | Ctrl+0 | Reset zoom | ズームリセット | Global |
| Cmd++ | Ctrl++ | Zoom in | 拡大 | Global |
| Cmd+- | Ctrl+- | Zoom out | 縮小 | Global |

---

## Web Menu Structure

In the web version, the menu is rendered as a UI component (`WEB_MENU_STRUCTURE`) with five top-level menus. All labels are in Japanese.

### ファイル (File)

| Menu Item | Action ID | Shortcut |
|-----------|-----------|----------|
| 新規ウィンドウ | `file:new-window` | Cmd/Ctrl+N |
| 開く | `file:open` | Cmd/Ctrl+O |
| 保存 | `file:save` | Cmd/Ctrl+S |
| 名前を付けて保存 | `file:save-as` | Shift+Cmd/Ctrl+S |
| タブを閉じる | `file:close-tab` | Cmd/Ctrl+W |

### 編集 (Edit)

| Menu Item | Action ID | Shortcut |
|-----------|-----------|----------|
| 元に戻す | `edit:undo` | Cmd/Ctrl+Z |
| やり直す | `edit:redo` | Cmd/Ctrl+Y |
| 切り取り | `edit:cut` | Cmd/Ctrl+X |
| コピー | `edit:copy` | Cmd/Ctrl+C |
| 貼り付け | `edit:paste` | Cmd/Ctrl+V |
| プレーンテキストとして貼り付け | `edit:paste-plain` | Shift+Cmd/Ctrl+V |
| すべて選択 | `edit:select-all` | Cmd/Ctrl+A |
| 検索 | `edit:find` | Cmd/Ctrl+F |
| ルビ | `edit:ruby` | Shift+Cmd/Ctrl+R |

### 表示 (View)

| Menu Item | Action ID | Shortcut |
|-----------|-----------|----------|
| 拡大 | `view:zoom-in` | Cmd/Ctrl++ |
| 縮小 | `view:zoom-out` | Cmd/Ctrl+- |
| ズームリセット | `view:zoom-reset` | Cmd/Ctrl+0 |

### ウィンドウ (Window)

| Menu Item | Action ID | Shortcut |
|-----------|-----------|----------|
| 最小化 | `window:minimize` | -- |
| フルスクリーン | `window:fullscreen` | -- |

### ヘルプ (Help)

| Menu Item | Action ID | Shortcut |
|-----------|-----------|----------|
| バージョン情報 | `help:about` | -- |

---

## Electron vs Web Comparison

| Feature | Electron | Web |
|---------|----------|-----|
| Menu rendering | Native OS menu bar | `WEB_MENU_STRUCTURE` rendered in the UI |
| Shortcut handling | OS-level accelerators via Electron | `useKeyboardShortcuts` hook with `keydown` listener |
| Editor key bindings | Electron passes through to Milkdown | Milkdown handles directly |
| Tab switching (Cmd/Ctrl+1-9) | Supported | Not available |
| Browser reload blocking | Not needed | Actively blocked (Cmd/Ctrl+R intercepted) |
| Window management | Native window controls | Limited (minimize, fullscreen via API) |

### Key Differences

**Electron:** Menu definitions are converted to Electron's `Menu.buildFromTemplate()` format. Accelerators are registered at the OS level, so they work regardless of which UI element has focus.

**Web:** The `useKeyboardShortcuts` hook attaches a single `keydown` event listener to the window. Shortcuts are split into two scope categories:
- **Always-active**: Fire regardless of focus (e.g. save, zoom, new-window, browser-reload block, settings).
- **Context-dependent**: Suppressed when a non-editor text input (e.g. settings dialog) has focus (e.g. search, ruby, tcy, tab navigation).

---

## useKeyboardShortcuts Hook

**File:** `lib/editor-page/use-keyboard-shortcuts.ts`

The `useKeyboardShortcuts` hook is the single, unified keyboard shortcut dispatcher for the web environment.

### Behavior

1. **Focus-scope aware**: Shortcuts are categorised into *always-active* and *context-dependent*. Always-active shortcuts (save, zoom, new-window, open, settings) fire regardless of which element has focus. Context-dependent shortcuts (search, ruby, tcy, tabs, split-editor) are suppressed when a non-editor `<input>`, `<textarea>`, or `contentEditable` element is focused, preventing misfires in settings dialogs.

2. **Platform detection**: Automatically detects macOS vs. Windows/Linux and maps modifier keys accordingly:
   - macOS: `Cmd` (Meta key)
   - Windows/Linux: `Ctrl`

3. **Browser reload blocking**: Intercepts `Cmd+R` / `Ctrl+R` to prevent accidental page reloads that would lose unsaved work.

---

## Adding a New Shortcut

To add a new keyboard shortcut:

1. **Define the action** in `lib/menu-definitions.ts` with the appropriate menu section, Japanese label, and accelerator string.

2. **Add the handler** in the component or hook that should respond to the shortcut.

3. **For Electron**, the menu definition is automatically picked up by the native menu builder.

4. **For Web**, add the shortcut handling in `useKeyboardShortcuts` (`lib/editor-page/use-keyboard-shortcuts.ts`). Choose the appropriate scope — always-active or context-dependent.

5. **Update the menu structure** in `WEB_MENU_STRUCTURE` if the shortcut should appear in the web menu.

---

## Related Documentation

- [Milkdown Plugin Development Guide](./milkdown-plugin.md) -- Editor plugin architecture
- [Linting Rules Guide](./linting-rules.md) -- Text quality rules and configuration
