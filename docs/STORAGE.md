# Storage Service Documentation

Complete guide to the Illusions storage system architecture and API.

---

## Quick Start

```typescript
import { getStorageService } from "@/lib/storage-service";

const storage = getStorageService();

// Initialize (called automatically on first use)
await storage.initialize();

// Save session
await storage.saveSession({
  appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
  recentFiles: [],
  editorBuffer: { content: "...", timestamp: Date.now() },
});

// Load session
const session = await storage.loadSession();
```

---

## Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              Application (React/Next.js)                     │
│                  Uses: getStorageService()                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│        StorageService Factory (storage-service.ts)           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ createStorageService() - Environment Detection       │   │
│  │ getStorageService() - Singleton Instance             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────┬───────────────────────────┬───────────────────┘
              │                           │
    ┌─────────┴──────────┐        ┌──────┴──────────────┐
    │                    │        │                     │
    ▼                    ▼        ▼                     ▼
Electron?          ┌──────────────────────┐       ┌──────────┐
  YES              │  WebStorageProvider  │       │ Browser? │
    │              │ (web-storage.ts)     │       │   YES    │
    │              │                      │       │          │
    ▼              │ IndexedDB via Dexie │       ▼          │
┌──────────────────────┐ (Async API)     │  ┌──────────┐   │
│  ElectronStorage     │                  │  │IndexedDB │   │
│  Provider            └──────────────────┘  └──────────┘   │
│ (electron-storage.ts)│                                     │
│                      │                                     │
│ IPC Client:          │                                     │
│ - ipcRenderer.invoke │                                     │
└──────────┬───────────┘                                     │
           │                                                 │
           │ IPC                                             │
           ▼                                                 │
┌──────────────────────────────────────────────┐            │
│ Electron Main Process (main.js)              │            │
│ + IPC Handlers                               │            │
│                                              │            │
│ ┌────────────────────────────────────────┐   │            │
│ │ ElectronStorageManager                 │   │            │
│ │ (electron-storage-manager.ts)          │   │            │
│ │                                        │   │            │
│ │ better-sqlite3 (Synchronous API)       │   │            │
│ │                                        │   │            │
│ │ ~/Library/Application Support/...      │   │            │
│ │ illusions-storage.db                   │   │            │
│ │                                        │   │            │
│ │ Tables:                                │   │            │
│ │ - app_state                            │   │            │
│ │ - recent_files                         │   │            │
│ │ - editor_buffer                        │   │            │
│ └────────────────────────────────────────┘   │            │
└──────────────────────────────────────────────┘            │
```

### Environment Detection

The storage service automatically detects the runtime environment:

- **Electron**: Uses SQLite via better-sqlite3 (main process)
- **Web**: Uses IndexedDB via Dexie.js (browser)

---

## API Reference

### Core Methods

#### `initialize(): Promise<void>`
Initialize the storage service. Called automatically on first use.

#### `saveSession(session: StorageSession): Promise<void>`
Save the complete session (app state, recent files, editor buffer).

#### `loadSession(): Promise<StorageSession | null>`
Load the complete session.

### App State

#### `saveAppState(appState: AppState): Promise<void>`
Save application state.

```typescript
await storage.saveAppState({
  lastOpenedMdiPath: "/path/to/file.mdi",
});
```

#### `loadAppState(): Promise<AppState | null>`
Load application state.

### Recent Files

#### `addToRecent(file: RecentFile): Promise<void>`
Add file to recent files list (max 10 files).

```typescript
await storage.addToRecent({
  name: "Document.mdi",
  path: "/path/to/Document.mdi",
  lastModified: Date.now(),
  snippet: "Content preview...",
});
```

#### `getRecentFiles(): Promise<RecentFile[]>`
Get list of recent files (sorted by last modified).

#### `removeFromRecent(path: string): Promise<void>`
Remove file from recent files list.

#### `clearRecent(): Promise<void>`
Clear all recent files.

### Editor Buffer

#### `saveEditorBuffer(buffer: EditorBuffer): Promise<void>`
Save editor content for crash recovery.

```typescript
await storage.saveEditorBuffer({
  content: editorContent,
  timestamp: Date.now(),
});
```

#### `loadEditorBuffer(): Promise<EditorBuffer | null>`
Load saved editor buffer.

#### `clearEditorBuffer(): Promise<void>`
Clear editor buffer (e.g., after successful save).

### Maintenance

#### `clearAll(): Promise<void>`
Clear all stored data. ⚠️ **Cannot be undone!**

---

## Type Definitions

```typescript
interface RecentFile {
  name: string;           // File name
  path: string;          // File path
  lastModified: number;  // Timestamp (ms)
  snippet?: string;      // Content preview
}

interface AppState {
  lastOpenedMdiPath?: string;
  // Add more app-level state fields here
}

interface EditorBuffer {
  content: string;      // Editor content
  timestamp: number;    // Timestamp
}

interface StorageSession {
  appState: AppState;
  recentFiles: RecentFile[];
  editorBuffer: EditorBuffer | null;
}

interface IStorageService {
  initialize(): Promise<void>;
  
  saveSession(session: StorageSession): Promise<void>;
  loadSession(): Promise<StorageSession | null>;
  
  saveAppState(appState: AppState): Promise<void>;
  loadAppState(): Promise<AppState | null>;
  
  addToRecent(file: RecentFile): Promise<void>;
  getRecentFiles(): Promise<RecentFile[]>;
  removeFromRecent(path: string): Promise<void>;
  clearRecent(): Promise<void>;
  
  saveEditorBuffer(buffer: EditorBuffer): Promise<void>;
  loadEditorBuffer(): Promise<EditorBuffer | null>;
  clearEditorBuffer(): Promise<void>;
  
  clearAll(): Promise<void>;
}
```

---

## Usage Patterns

### Pattern 1: Restore on Startup

```typescript
useEffect(() => {
  const restore = async () => {
    const storage = getStorageService();
    const session = await storage.loadSession();

    if (session?.appState.lastOpenedMdiPath) {
      await openFile(session.appState.lastOpenedMdiPath);
    }

    if (session?.editorBuffer) {
      restoreContent(session.editorBuffer.content);
    }
  };

  restore();
}, []);
```

### Pattern 2: Auto-save Every 30 Seconds

```typescript
useEffect(() => {
  const storage = getStorageService();

  const interval = setInterval(async () => {
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now(),
    });
  }, 30000);

  return () => clearInterval(interval);
}, [editorContent]);
```

### Pattern 3: Update Recent Files on Save

```typescript
async function saveFile(path: string, content: string) {
  const storage = getStorageService();

  // ... save to filesystem ...

  await storage.addToRecent({
    name: path.split("/").pop() || "Untitled",
    path,
    lastModified: Date.now(),
    snippet: content.substring(0, 100),
  });

  await storage.clearEditorBuffer();
}
```

---

## Environment Differences

### Electron

- ✅ **Fast**: Synchronous SQLite operations
- ✅ **No limits**: Storage limited only by disk space
- ✅ **Persistent**: Stored in OS-specific application data directory
- ❌ **Requires IPC**: Must communicate with main process

**Storage Location:**
- macOS: `~/Library/Application Support/Illusions/illusions-storage.db`
- Windows: `%APPDATA%\Illusions\illusions-storage.db`
- Linux: `~/.config/Illusions/illusions-storage.db`

### Web (IndexedDB)

- ✅ **Universal**: Works in any browser
- ✅ **No backend**: Client-side only
- ❌ **Async only**: All operations are Promise-based
- ❌ **Quota limits**: ~50MB typical quota (varies by browser)
- ❌ **Private browsing**: May not persist data

---

## Debugging

### Inspect Electron Database

```bash
# macOS
sqlite3 ~/Library/Application\ Support/Illusions/illusions-storage.db

# View schema
.schema

# Query data
SELECT * FROM app_state;
SELECT * FROM recent_files;
SELECT * FROM editor_buffer;
```

### Inspect Web IndexedDB

1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB**
4. Select **IllusionsStorage** database
5. Browse tables: `appState`, `recentFiles`, `editorBuffer`

---

## Migration & Compatibility

### Breaking Changes from v1

- ❌ `MockStorageAdapter` removed
- ❌ Direct tokenizer imports no longer work
- ❌ CDN tokenizer removed

### Migration Guide

```typescript
// Before (v1)
import { MockStorageAdapter } from '@/lib/storage-adapter';
const adapter = new MockStorageAdapter();

// After (v2)
import { getStorageService } from '@/lib/storage-service';
const storage = getStorageService();
```

### Data Portability

**Q: Can I share data between Web and Electron?**

A: No direct sharing. Web uses IndexedDB, Electron uses SQLite. To transfer data:

1. Export data as JSON from one environment
2. Import JSON into the other environment

**Q: Can I encrypt sensitive data?**

A: Yes, encrypt data before calling `saveAppState()` and decrypt after `loadAppState()`.

---

## FAQ

**Q: What happens if storage initialization fails?**

A: The service will throw an error. Catch it and show a user-friendly message.

**Q: How do I clear all data for testing?**

A: Call `await storage.clearAll()`. ⚠️ This cannot be undone!

**Q: Can I use this with React Server Components?**

A: No, this is a client-side service. Use it only in `"use client"` components.

**Q: What if IndexedDB quota is exceeded?**

A: The service will throw a `QuotaExceededError`. Handle it by:
- Clearing old data
- Asking user to free up space
- Implementing data compression

---

## Integration Checklist

- [ ] Install `better-sqlite3` (for Electron)
- [ ] Add IPC handlers in `electron/main.ts`
- [ ] Expose storage API in `electron/preload.ts`
- [ ] Call `loadSession()` on app startup
- [ ] Test in both Electron and Web environments
- [ ] Implement error handling for quota limits
- [ ] Add data export/import features (optional)

---

**Last Updated**: 2026-02-06  
**Version**: 2.0.0
