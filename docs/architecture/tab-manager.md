---
title: タブ管理
slug: tab-manager
type: architecture
status: active
updated: 2026-07-07
tags:
  - architecture
  - tabs
---

# Tab Manager Documentation

Composable React hook system for multi-tab editing in the illusions editor.

---

## Overview

The Tab Manager provides multi-tab editing through a set of composable React hooks, coordinated by the top-level `useTabManager()` hook. Each concern (state management, file I/O, auto-save, persistence, close dialogs, menu bindings) is handled by a dedicated hook, keeping the codebase modular and testable.

Key behaviors:

- **Auto-save**: Dirty tabs are saved automatically every 5 seconds (foreground). When power-save mode is enabled and the window is backgrounded, the interval is throttled to 20 seconds by `lib/editor-page/power-policy.ts`.
- **Tab persistence**: Tab state is persisted with a 1-second debounce, and restored on app startup.
- **Preview tabs**: Single-click opens a preview tab; editing or double-click promotes it to a full tab.
- **Deduplication**: Opening an already-open file switches to its existing tab rather than creating a duplicate.
- **Demo content**: On first use, loads a sample file (`kagami-jigoku.mdi`) so the editor is not empty.

### Key Files

| File                                            | Purpose                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `lib/tab-manager/types.ts`                      | Type definitions (`TabState`, `MdiFileDescriptor`, constants)       |
| `lib/tab-manager/index.ts`                      | `useTabManager()` -- top-level composing hook                       |
| `lib/tab-manager/save-executor.ts`              | Unified save pipeline (lock, sanitize, VFS write, snapshot) (#1432) |
| `lib/tab-manager/save-lock.ts`                  | Per-path save lock preventing concurrent writes (#1432)             |
| `lib/tab-manager/use-tab-state.ts`              | Tab CRUD and active tab management                                  |
| `lib/tab-manager/use-file-io.ts`                | Open, save, and load file operations                                |
| `lib/tab-manager/use-auto-save.ts`              | Power-aware auto-save timer (5s foreground / 20s background)        |
| `lib/tab-manager/use-tab-persistence.ts`        | Persist/restore tabs (1s debounce)                                  |
| `lib/tab-manager/use-close-dialog.ts`           | Save/Discard/Cancel dialog on tab close                             |
| `lib/tab-manager/use-electron-menu-bindings.ts` | Electron IPC menu integration                                       |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      useTabManager()                             │
│                      (index.ts)                                  │
│                                                                  │
│  Composes all hooks and exposes a unified API to the editor:     │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │  useTabState()      │    │  useFileIO()                    │ │
│  │                     │    │                                  │ │
│  │  - tabs[]           │◄──►│  - openFile()                   │ │
│  │  - activeTabId      │    │  - saveFile()                   │ │
│  │  - addTab()         │    │  - loadFileContent()            │ │
│  │  - removeTab()      │    │                                  │ │
│  │  - updateTab()      │    │  Uses: VFS (getVFS())           │ │
│  │  - setActiveTab()   │    └─────────────────────────────────┘ │
│  └──────────┬──────────┘                                        │
│             │                                                    │
│  ┌──────────┴──────────┐    ┌─────────────────────────────────┐ │
│  │  useCloseDialog()   │    │  useAutoSave()                  │ │
│  │                     │    │                                  │ │
│  │  - promptClose()    │    │  - 5s interval timer            │ │
│  │  - Save / Discard   │    │  - Saves dirty tabs only        │ │
│  │    / Cancel flow    │    │  - Skips tabs currently saving   │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────┐  ┌───────────────────────────────┐ │
│  │  useElectronMenu        │  │  useTabPersistence()          │ │
│  │  Bindings()             │  │                                │ │
│  │                         │  │  - 1s debounce save            │ │
│  │  - setDirty()           │  │  - Restore on mount            │ │
│  │  - onSaveBeforeClose    │  │                                │ │
│  │  - onMenuSave           │  │  Electron: AppState (SQLite)   │ │
│  │  - etc.                 │  │  Web: IndexedDB                │ │
│  └─────────────────────────┘  └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Interfaces

### `TabState`

Represents the state of a single editor tab.

```typescript
interface TabState {
  id: string; // Unique tab identifier
  file: MdiFileDescriptor | null; // Associated file (null for new/untitled)
  content: string; // Current editor content
  lastSavedContent: string; // Content at last save (for dirty detection)
  isDirty: boolean; // Has unsaved changes
  lastSavedTime: number | null; // Timestamp of last save (ms)
  isSaving: boolean; // Currently saving to disk
  isPreview: boolean; // Preview tab (single-click, not yet promoted)
  fileType: string; // File type (e.g., "mdi", "txt")
}
```

### `MdiFileDescriptor`

Describes a file reference, platform-agnostic.

```typescript
interface MdiFileDescriptor {
  path: string | null; // Absolute path (Electron) or null (Web)
  handle: FileSystemFileHandle | null; // File System API handle (Web) or null
  name: string; // Display name (e.g., "document.mdi")
}
```

### Constants

```typescript
const AUTO_SAVE_INTERVAL = 5000; // Auto-save every 5 seconds (foreground)
// BACKGROUND_AUTO_SAVE_INTERVAL_MS = 20_000 — throttled interval when
// power-save mode is enabled and window is backgrounded (lib/editor-page/power-policy.ts)
const TAB_PERSIST_DEBOUNCE = 1000; // Debounce tab persistence by 1 second
```

---

## Code Examples

### Using the Tab Manager

```typescript
import { useTabManager } from "@/lib/tab-manager";

function EditorLayout() {
  const { tabs, activeTabId, switchTab, closeTab, updateTab, openFile, saveFile } = useTabManager();

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Dockview renders the tab header and panels. Consumers manipulate the
  // tab model through the composed manager instead of rendering a second tab bar.
  return { activeTab, switchTab, closeTab, updateTab, openFile, saveFile };
}
```

### Preview Tab Behavior

Preview tabs are created on single-click (e.g., from a file tree). They are replaced by the next preview open, or promoted to a full tab when the user starts editing.

```typescript
// Single-click: open as preview (replaces existing preview tab)
const tab = addTab({ isPreview: true, file: fileDescriptor });

// User starts editing: promote to full tab
function handleEdit(tabId: string) {
  updateTab(tabId, { isPreview: false });
}

// Double-click: open directly as a full tab
const tab = addTab({ isPreview: false, file: fileDescriptor });
```

### Close Dialog Flow

When the user closes a dirty tab, a confirmation dialog appears:

```typescript
// Triggered by useCloseDialog()
async function handleCloseTab(tabId: string) {
  const tab = tabs.find((t) => t.id === tabId);

  if (tab?.isDirty) {
    // Shows dialog with three options:
    // - Save (保存): save then close
    // - Discard (破棄): close without saving
    // - Cancel (キャンセル): keep tab open
    const result = await promptClose(tabId);

    if (result === "save") {
      await saveFile(tabId);
      removeTab(tabId);
    } else if (result === "discard") {
      removeTab(tabId);
    }
    // "cancel" -> do nothing
  } else {
    removeTab(tabId);
  }
}
```

### Content Sanitization

Before saving, the tab manager strips any HTML that may have been injected by the rich-text editor, ensuring only clean MDI content is written to disk:

```typescript
// Internal: called automatically before writeFile
function sanitizeContent(content: string): string {
  // Strip HTML tags, normalize whitespace
  // Ensures .mdi file contains only valid MDI syntax
  return stripHtml(content);
}
```

---

## Hook Responsibilities

### `useTabState()`

Core state management for the tab array and active tab selection.

- `tabs: TabState[]` -- the full list of open tabs
- `activeTabId: string | null` -- the currently focused tab
- `addTab()` -- create a new tab (with deduplication check)
- `removeTab()` -- remove a tab by ID
- `updateTab()` -- partial update of a tab's state
- `setActiveTab()` -- switch the active tab

### `useFileIO()`

Handles all file operations through the VFS abstraction.

- `openFile()` -- open a file from disk (shows dialog if no path given)
- `saveFile()` -- save tab content to its associated file
- `saveFileAs()` -- save with a new name/path (shows dialog)
- `loadFileContent()` -- read file content into a tab

Each file-open and save path emits anonymous usage events via `trackUsageEvent()` (`lib/analytics/usage-events.ts`): `file_open_started`, `file_open_completed`, `file_open_failed`, `save_attempted`, `save_completed`, `save_failed`, `save_blocked`, `save_conflict_blocked`, and `save_all_completed`. Events are only sent when the user has consented to usage analytics.

### `useAutoSave()`

Manages the auto-save timer with power-aware throttling. In the foreground, ticks every 5 seconds; when power-save mode is enabled and the window is backgrounded, the interval is extended to 20 seconds (`BACKGROUND_AUTO_SAVE_INTERVAL_MS` from `lib/editor-page/power-policy.ts`). On each tick, iterates through all tabs and saves any that are dirty and not currently in a save operation. Actual save logic is delegated to `save-executor.ts` (#1432). Each auto-save attempt emits `autosave_attempted`; failures emit `autosave_failed` via `trackUsageEvent()`.

### `useTabPersistence()`

Serializes the current tab state (tab list, active tab ID, file references) and persists it with a 1-second debounce. On mount, restores the previous session's tabs.

### `useCloseDialog()`

Manages the Save/Discard/Cancel confirmation flow when closing a dirty tab. Integrates with Electron's native dialog on desktop and a custom modal on web.

### `useElectronMenuBindings()`

Binds Electron application menu actions (File -> Save, File -> Close, etc.) to the corresponding tab manager operations via IPC:

- `setDirty(isDirty)` -- Update window title dot indicator
- `onSaveBeforeClose` -- Handle app quit with unsaved changes
- `onMenuSave` -- Trigger save from menu
- `onMenuSaveAs` -- Trigger save-as from menu
- `onMenuClose` -- Trigger tab close from menu

---

## Platform Comparison

| Feature            | Electron                                      | Web                                           |
| ------------------ | --------------------------------------------- | --------------------------------------------- |
| Tab persistence    | AppState via SQLite                           | IndexedDB (single-file mode)                  |
| File I/O           | VFS + system dialog (`dialog.showOpenDialog`) | File System Access API (`showOpenFilePicker`) |
| File reference     | `path` (absolute string)                      | `handle` (`FileSystemFileHandle`)             |
| Visibility reload  | Yes (reloads on `visibilitychange`)           | No                                            |
| Menu bindings      | Native Electron menu via IPC                  | Not applicable (web UI controls only)         |
| Close confirmation | Native Electron dialog                        | Custom modal component                        |

---

## Demo Content

On first use (no persisted tabs), the tab manager loads a demo file to provide an immediate editing experience:

- **File**: `kagami-jigoku.mdi` (Edogawa Ranpo's "The Hell of Mirrors")
- **Purpose**: Demonstrates vertical writing, ruby annotations, and MDI syntax
- **Behavior**: Loaded as a new unsaved tab (no file association)

---

## Related Documents

- [Virtual File System](./vfs.md) -- File operations abstraction used by `useFileIO()`
- [Storage Service](./storage-system.md) -- Persistence backend used by `useTabPersistence()`
- [Notification System](./notification-system.md) -- Displays save confirmations and error messages

---

**Last Updated**: 2026-07-07
**Version**: 1.1.0
