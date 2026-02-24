# Keyboard Shortcuts Reference

## Overview

illusions supports keyboard shortcuts across both Electron (desktop) and Web environments. Shortcuts are defined in `lib/menu-definitions.ts` and handled by `lib/use-global-shortcuts.ts`. The menu system uses Japanese labels for all user-facing items.

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
| Shortcut handling | OS-level accelerators via Electron | `useGlobalShortcuts` hook with `keydown` listener |
| Editor key bindings | Electron passes through to Milkdown | Milkdown handles directly |
| Tab switching (Cmd/Ctrl+1-9) | Supported | Not available |
| Browser reload blocking | Not needed | Actively blocked (Cmd/Ctrl+R intercepted) |
| Window management | Native window controls | Limited (minimize, fullscreen via API) |

### Key Differences

**Electron:** Menu definitions are converted to Electron's `Menu.buildFromTemplate()` format. Accelerators are registered at the OS level, so they work regardless of which UI element has focus.

**Web:** The `useGlobalShortcuts` hook attaches a `keydown` event listener to the document. It must coordinate with the Milkdown editor to avoid conflicts -- shortcuts only fire when the editor does not have focus for the same key combination.

---

## useGlobalShortcuts Hook

**File:** `lib/use-global-shortcuts.ts`

The `useGlobalShortcuts` hook manages keyboard shortcut handling in the web environment.

### Behavior

1. **Focus-aware**: Only fires for shortcuts when the editor does not have focus for the relevant key combination. This prevents conflicts where both the hook and the editor would respond to the same keystroke.

2. **Platform detection**: Automatically detects macOS vs. Windows/Linux and maps modifier keys accordingly:
   - macOS: `Cmd` (Meta key)
   - Windows/Linux: `Ctrl`

3. **Browser reload blocking**: Intercepts `Cmd+R` / `Ctrl+R` to prevent accidental page reloads that would lose unsaved work.

### formatAccelerator()

Converts internal shortcut format to platform-appropriate display strings:

```typescript
import { formatAccelerator } from "@/lib/use-global-shortcuts";

// On macOS:
formatAccelerator("Ctrl+S");    // Returns: "⌘S"
formatAccelerator("Ctrl+Shift+R"); // Returns: "⇧⌘R"

// On Windows:
formatAccelerator("Ctrl+S");    // Returns: "Ctrl+S"
formatAccelerator("Ctrl+Shift+R"); // Returns: "Shift+Ctrl+R"
```

The internal format always uses `Ctrl` as the primary modifier. On macOS, this is displayed as the Command symbol. Modifier key display mapping:

| Internal | macOS Display | Windows Display |
|----------|--------------|-----------------|
| `Ctrl` | `⌘` (Command) | `Ctrl` |
| `Shift` | `⇧` | `Shift` |
| `Alt` | `⌥` (Option) | `Alt` |

### Usage Example

```typescript
import { useGlobalShortcuts } from "@/lib/use-global-shortcuts";

function App() {
  const handlers = {
    "file:save": () => saveCurrentFile(),
    "file:open": () => openFileDialog(),
    "edit:find": () => toggleSearchPanel(),
  };

  useGlobalShortcuts(handlers);

  return <Editor />;
}
```

---

## Adding a New Shortcut

To add a new keyboard shortcut:

1. **Define the action** in `lib/menu-definitions.ts` with the appropriate menu section, Japanese label, and accelerator string.

2. **Add the handler** in the component or hook that should respond to the shortcut.

3. **For Electron**, the menu definition is automatically picked up by the native menu builder.

4. **For Web**, ensure the action ID is handled in the `useGlobalShortcuts` callback map.

5. **Update the menu structure** in `WEB_MENU_STRUCTURE` if the shortcut should appear in the web menu.

Example:

```typescript
// In menu-definitions.ts
{
  label: "新しいアクション",
  actionId: "edit:new-action",
  accelerator: "Ctrl+Shift+A",
}
```

```typescript
// In useGlobalShortcuts handler map
"edit:new-action": () => performNewAction(),
```

---

## Related Documentation

- [Milkdown Plugin Development Guide](./milkdown-plugin.md) -- Editor plugin architecture
- [Linting Rules Guide](./linting-rules.md) -- Text quality rules and configuration
