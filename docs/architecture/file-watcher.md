# File Watcher Documentation

Dual-mode file change monitoring with save suppression to prevent false notifications from the application's own writes.

---

## Overview

The file watcher monitors external changes to files currently open in the editor. When another application modifies a file, the watcher detects the change and notifies the editor so it can prompt the user to reload. A save suppression mechanism prevents the watcher from triggering false positives when the application itself writes to disk.

### Key File

| File | Lines | Purpose |
|------|-------|---------|
| `lib/file-watcher.ts` | ~423 | Complete file watcher implementation |

### Features

- Dual-mode: native filesystem events (Electron) or polling (Web)
- Automatic save suppression to ignore self-triggered changes
- Configurable poll interval with failure tolerance
- Global suppression map with periodic cleanup

---

## Architecture

### System Diagram

```
┌───────────────────────────────────────────────────────┐
│  Editor Component                                      │
│                                                        │
│  use-file-io.ts ─────┬──► createFileWatcher(options)  │
│  use-auto-save.ts ───┤                                │
│                       └──► suppressFileWatch(path)     │
└───────────┬──────────────────────────┬────────────────┘
            │                          │
            ▼                          ▼
  ┌──────────────────┐      ┌──────────────────────────┐
  │ Environment      │      │ Save Suppression          │
  │ Detection        │      │                           │
  │                  │      │ Global Map<path, expiry>  │
  │ Electron?        │      │ Duration: 3000ms          │
  │   YES → Native   │      │ Cleanup: every 5 min      │
  │   NO  → Polling  │      └──────────────────────────┘
  └──┬──────────┬────┘
     │          │
     ▼          ▼
┌──────────┐ ┌──────────────┐
│ Electron │ │ Web          │
│ File     │ │ File         │
│ Watcher  │ │ Watcher      │
│          │ │              │
│ VFS      │ │ Poll         │
│ watchFile│ │ lastModified │
│ + poll   │ │ every 5s     │
│ fallback │ │              │
│          │ │ Auto-stop    │
│          │ │ after 5      │
│          │ │ failures     │
└──────────┘ └──────────────┘
```

### Two Implementations

#### WebFileWatcher

- **Mechanism**: Polls `file.lastModified` at a configurable interval (default: 5 seconds)
- **Failure handling**: Auto-stops after `MAX_CONSECUTIVE_FAILURES` (5) consecutive poll failures (e.g., file deleted)
- **Environment**: Used in the web/browser context where native filesystem events are unavailable

#### ElectronFileWatcher

- **Mechanism**: Uses native VFS `watchFile()` for filesystem event monitoring
- **Fallback**: Falls back to the polling strategy if native watching is unavailable or unreliable
- **Environment**: Used in the Electron main/renderer process

### Save Suppression System

When the application saves a file, the watcher must ignore the resulting filesystem change. This is achieved via a global suppression map:

```
suppressFileWatch(path) called before write
           │
           ▼
  Map<path, expiryTimestamp>
  entry added: now + 3000ms
           │
           ▼
  Watcher detects change
  → checks suppression map
  → if path found and not expired → IGNORE
  → if path not found or expired → NOTIFY
           │
           ▼
  Cleanup timer (every 5 min)
  removes expired entries
```

---

## Key Interfaces and Types

```typescript
/** Callback invoked when an external change is detected */
type FileChangeCallback = (content: string) => void;

/** Configuration for creating a file watcher */
interface FileWatcherOptions {
  path: string;                // Absolute path to the file to watch
  onChanged: FileChangeCallback; // Called when external change detected
  pollIntervalMs?: number;     // Poll interval in ms (default: 5000)
}

/** File watcher instance */
interface FileWatcher {
  start(): void;               // Begin watching the file
  stop(): void;                // Stop watching and clean up
  isActive: boolean;           // Whether the watcher is currently running
}
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_POLL_INTERVAL_MS` | `5000` | Default polling interval (5 seconds) |
| `MAX_CONSECUTIVE_FAILURES` | `5` | Auto-stop threshold for consecutive poll failures |
| `SAVE_SUPPRESSION_MS` | `3000` | Duration to suppress change notifications after a save |
| `SUPPRESSION_CLEANUP_INTERVAL_MS` | `300000` | Interval for cleaning up expired suppression entries (5 minutes) |

---

## Code Examples

### Creating a File Watcher

```typescript
import { createFileWatcher } from "@/lib/file-watcher";

const watcher = createFileWatcher({
  path: "/path/to/document.mdi",
  onChanged: (newContent) => {
    // Prompt user: "File changed externally. Reload?"
    showReloadDialog(newContent);
  },
  pollIntervalMs: 5000,
});

// Start watching
watcher.start();

// Stop watching (e.g., when closing the file)
watcher.stop();
```

### Suppressing Notifications During Save

```typescript
import { suppressFileWatch } from "@/lib/file-watcher";

async function saveFile(path: string, content: string) {
  // Suppress BEFORE writing to prevent false notification
  suppressFileWatch(path);

  // Write file to disk
  await writeFileToDisk(path, content);
}
```

### Integration with `use-file-io` Hook

```typescript
// Inside use-file-io.ts (simplified)
useEffect(() => {
  if (!filePath) return;

  const watcher = createFileWatcher({
    path: filePath,
    onChanged: (content) => {
      setExternalChangeDetected(true);
      setExternalContent(content);
    },
  });

  watcher.start();

  return () => {
    watcher.stop();
  };
}, [filePath]);
```

### Integration with `use-auto-save` Hook

```typescript
// Inside use-auto-save.ts (simplified)
const autoSave = useCallback(async () => {
  if (!filePath || !isDirty) return;

  // Suppress file watcher before auto-save write
  suppressFileWatch(filePath);

  await saveContent(filePath, editorContent);
  setIsDirty(false);
}, [filePath, isDirty, editorContent]);
```

---

## Error Handling

### Poll Failure Auto-Stop

The `WebFileWatcher` tracks consecutive poll failures. After 5 failures in a row (e.g., file deleted, permissions changed), it automatically stops watching to avoid unnecessary resource consumption. The counter resets on any successful poll.

### Suppression Map Cleanup

Expired entries in the suppression map are cleaned up every 5 minutes by a periodic timer. This prevents memory leaks when many files are opened and closed over a long editing session.

---

## Related Documentation

- [Storage System](./storage-system.md) -- Persistence layer for editor state
- [History Service](./history-service.md) -- Snapshot creation triggered alongside file operations
- [Project Lifecycle](./project-lifecycle.md) -- Project file management context

---

**Last Updated**: 2026-02-25
**Version**: 1.0.0
