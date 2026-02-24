# Virtual File System (VFS) Documentation

Platform-agnostic file operations abstraction for the illusions editor.

---

## Overview

The Virtual File System (VFS) provides a unified API for file operations across Electron and Web environments. It abstracts platform-specific details behind a common interface, allowing the application to read, write, and manage files without knowing the underlying runtime.

- **Electron mode**: IPC-based communication with the main process, which uses Node.js `fs` for actual file operations. Per-window security with root tracking and path denylist.
- **Web mode**: File System Access API with browser-managed sandboxing. Graceful fallbacks for operations not supported in the browser (e.g., rename simulated via copy+delete).
- **Factory pattern**: `getVFS()` returns a singleton instance appropriate for the detected environment.

### Key Files

| File | Purpose |
|------|---------|
| `lib/vfs/types.ts` | Core interfaces and type definitions |
| `lib/vfs/index.ts` | Factory function `getVFS()` and environment detection |
| `lib/electron-vfs.ts` | Electron renderer-side VFS implementation (IPC client) |
| `lib/vfs/web-vfs.ts` | Web VFS implementation (File System Access API) |
| `electron-vfs-ipc-handlers.js` | Electron main process IPC handlers |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                Application (React/Next.js)                       │
│                    Uses: getVFS()                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              VFS Factory (lib/vfs/index.ts)                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  getVFS() — Singleton, auto-detects environment           │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
     ┌─────────┴──────────┐        ┌──────────┴──────────────┐
     │   Electron?  YES   │        │      Browser?  YES      │
     │                    │        │                         │
     ▼                    │        ▼                         │
┌──────────────────────┐  │  ┌──────────────────────────┐    │
│  ElectronVFS         │  │  │  WebVFS                  │    │
│  (electron-vfs.ts)   │  │  │  (web-vfs.ts)            │    │
│                      │  │  │                          │    │
│  ipcRenderer.invoke  │  │  │  File System Access API  │    │
│  for all operations  │  │  │  (showDirectoryPicker,   │    │
│                      │  │  │   FileSystemFileHandle)  │    │
└──────────┬───────────┘  │  └──────────────────────────┘    │
           │              │                                   │
           │ IPC          │                                   │
           ▼              │                                   │
┌──────────────────────────────────────────────┐              │
│  Electron Main Process                       │              │
│  (electron-vfs-ipc-handlers.js)              │              │
│                                              │              │
│  ┌────────────────────────────────────────┐  │              │
│  │  IPC Handlers (vfs:* channels)        │  │              │
│  │                                        │  │              │
│  │  Security:                             │  │              │
│  │  - Per-window allowedRoots Map         │  │              │
│  │  - Path traversal prevention           │  │              │
│  │  - Denylist (isDeniedPath)             │  │              │
│  │  - Dialog-approved paths LRU (200)     │  │              │
│  │                                        │  │              │
│  │  Write: open → write → sync → close   │  │              │
│  │  (Google Drive / network drive safe)   │  │              │
│  └────────────────────────────────────────┘  │              │
│                                              │              │
│  Node.js fs (actual file operations)         │              │
└──────────────────────────────────────────────┘              │
```

---

## Key Interfaces

### `VirtualFileSystem`

The core interface that all VFS implementations must satisfy.

```typescript
interface VirtualFileSystem {
  // Directory operations
  openDirectory(): Promise<VFSDirectoryHandle>;
  getDirectoryHandle(path: string): Promise<VFSDirectoryHandle>;
  listDirectory(path: string): Promise<VFSEntry[]>;

  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  getFileMetadata(path: string): Promise<VFSFileMetadata>;

  // Optional capabilities (platform-dependent)
  watchFile?(path: string, callback: (event: VFSWatchEvent) => void): void;
  getRootPath?(): string;

  // State
  isRootOpen(): boolean;
}
```

### Supporting Types

```typescript
interface VFSFileMetadata {
  name: string;
  size: number;
  lastModified: number;    // Unix timestamp (ms)
  type: string;            // MIME type or extension
}

interface VFSEntry {
  name: string;
  kind: "file" | "directory";
  path: string;
}

interface VFSWatchEvent {
  type: "change" | "rename" | "delete";
  path: string;
}

interface VFSFileHandle {
  name: string;
  path: string;
  read(): Promise<string>;
  write(content: string): Promise<void>;
  getFile(): Promise<File>;
}

interface VFSDirectoryHandle {
  name: string;
  path: string;
  getFileHandle(name: string): Promise<VFSFileHandle>;
  getDirectoryHandle(name: string): Promise<VFSDirectoryHandle>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, VFSFileHandle | VFSDirectoryHandle]>;
}
```

---

## Code Examples

### Basic File Operations

```typescript
import { getVFS } from "@/lib/vfs";

const vfs = getVFS();

// Open a directory (shows native picker dialog)
const dirHandle = await vfs.openDirectory();

// Read a file
const content = await vfs.readFile("/path/to/document.mdi");

// Write a file
await vfs.writeFile("/path/to/document.mdi", updatedContent);

// List directory contents
const entries = await vfs.listDirectory("/path/to/folder");
for (const entry of entries) {
  console.log(`${entry.kind}: ${entry.name} (${entry.path})`);
}
```

### Check Root and Get Metadata

```typescript
const vfs = getVFS();

if (vfs.isRootOpen()) {
  // Only available in Electron
  const rootPath = vfs.getRootPath?.();
  console.log("Root directory:", rootPath);
}

const metadata = await vfs.getFileMetadata("/path/to/file.mdi");
console.log(`${metadata.name} — ${metadata.size} bytes, modified ${metadata.lastModified}`);
```

### File Watching (Electron Only)

```typescript
const vfs = getVFS();

// Watch for changes (Electron: native fs.watch + polling fallback)
vfs.watchFile?.("/path/to/file.mdi", (event) => {
  if (event.type === "change") {
    console.log("File changed externally:", event.path);
    // Prompt user to reload
  }
});
```

---

## IPC Channels (Electron)

All IPC channels use the `vfs:` prefix. The main process validates every request against the per-window security context.

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `vfs:open-directory` | Renderer -> Main | Show directory picker, register root |
| `vfs:read-file` | Renderer -> Main | Read file contents (UTF-8) |
| `vfs:write-file` | Renderer -> Main | Write file (open -> write -> sync -> close) |
| `vfs:read-directory` | Renderer -> Main | List directory entries |
| `vfs:stat` | Renderer -> Main | Get file metadata |
| `vfs:mkdir` | Renderer -> Main | Create directory (recursive) |
| `vfs:delete` | Renderer -> Main | Delete file or directory |
| `vfs:rename` | Renderer -> Main | Rename / move file |
| `vfs:set-root` | Renderer -> Main | Set allowed root for a window |

---

## Security Model (Electron)

The Electron VFS enforces multiple layers of protection in the main process:

### Per-Window Root Tracking

Each `BrowserWindow` has an entry in the `allowedRoots` Map. File operations are only permitted within the registered root directory. When the window is destroyed (`web-contents-created` -> `destroyed` event), its entry is cleaned up automatically.

### Path Traversal Prevention

Before any file operation, the handler resolves the requested path and verifies it is a descendant of the window's allowed root. Paths containing `..` that escape the root are rejected.

### Denylist (`isDeniedPath`)

Certain sensitive system paths are always blocked, regardless of root:

- `/etc`, `/var`
- `~/.ssh`, `~/.gnupg`, `~/.aws`
- `C:\Windows`, `C:\Program Files`
- Other OS-specific protected directories

### Dialog-Approved Paths

Paths selected through Electron's native file dialog are tracked in an LRU Map (max 200 entries) to allow subsequent operations on those paths without re-prompting the user.

---

## Platform Comparison

| Feature | Electron | Web |
|---------|----------|-----|
| Path format | Absolute (`/Users/.../file.mdi`) | Relative (from directory handle root) |
| File watching | Native `fs.watch` + polling fallback | Polling only (5s interval) |
| Rename | Native `fs.rename` (atomic) | Simulated via copy + delete |
| Permissions | Per-window `allowedRoots` + denylist | Browser sandbox (user grants access) |
| `getRootPath()` | Available (returns absolute path) | Not available |
| Write safety | Explicit `open -> write -> sync -> close` | File System Access API handles it |
| Network drives | Supported (explicit sync for compatibility) | Not supported |

---

## Related Documents

- [Storage Service](./storage-system.md) -- Persistence layer that uses VFS for file-level operations
- [Tab Manager](./tab-manager.md) -- Multi-tab editing built on top of VFS for file I/O
- [NLP Backend](./nlp-backend-architecture.md) -- Reads files through VFS for text analysis

---

**Last Updated**: 2026-02-25
**Version**: 1.0.0
