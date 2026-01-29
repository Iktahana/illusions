# Storage Service Architecture

## 系統架構圖

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Application (React/Next.js)                   │
│                     Uses: getStorageService()                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│            StorageService Factory (storage-service.ts)             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ createStorageService() - Environment Detection             │  │
│  │ getStorageService() - Singleton Instance                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────┬──────────────────┘
                      │                           │
        ┌─────────────┴──────────┐        ┌──────┴──────────────┐
        │                        │        │                     │
        ▼                        ▼        ▼                     ▼
   Electron?              ┌──────────────────────┐         ┌──────────────┐
   YES                    │   WebStorageProvider │         │   Browser?   │
        │                 │  (web-storage.ts)    │         │     YES      │
        │                 │                      │         │              │
        ▼                 │ IndexedDB via Dexie │         ▼              │
┌──────────────────────┐  │ (Async API)         │    ┌──────────────┐   │
│  ElectronStorage     │  └──────────────────────┘    │ IndexedDB    │   │
│  Provider            │                              │ Browser API │   │
│ (electron-storage.ts)│  ┌──────────────────────┐    └──────────────┘   │
│                      │  │  Tables:             │                        │
│ IPC Client:          │  │  - appState          │                        │
│ - Calls main process │  │  - recentFiles       │                        │
│   via ipcRenderer    │  │  - editorBuffer      │                        │
│   .invoke()          │  └──────────────────────┘                        │
└──────────┬───────────┘                                                   │
           │                                                              │
           │ IPC                                                          │
           │                                                              │
           ▼                                                              │
┌──────────────────────────────────────────────┐                         │
│ Electron Main Process (electron/main.ts)     │                         │
│ + IPC Handlers                               │                         │
│                                              │                         │
│ ┌────────────────────────────────────────┐  │                         │
│ │ ElectronStorageManager                 │  │                         │
│ │ (electron-storage-manager.ts)          │  │                         │
│ │                                        │  │                         │
│ │ better-sqlite3                         │  │                         │
│ │ (Synchronous API)                      │  │                         │
│ │                                        │  │                         │
│ │ ~/Library/Application Support/...      │  │                         │
│ │ illusions-storage.db                   │  │                         │
│ │                                        │  │                         │
│ │ Tables:                                │  │                         │
│ │ - app_state                            │  │                         │
│ │ - recent_files                         │  │                         │
│ │ - editor_buffer                        │  │                         │
│ └────────────────────────────────────────┘  │                         │
│                                              │                         │
│ Preload Script (electron/preload.ts)        │                         │
│ - Exposes storage API to renderer via       │                         │
│   contextBridge.exposeInMainWorld()         │                         │
└──────────────────────────────────────────────┘                         │
                                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

## IPC 通訊流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Renderer Process (Browser)                        │
│                                                                     │
│  await storage.saveSession(session)                                │
│           │                                                         │
│           ▼                                                         │
│  ipcRenderer.invoke("storage-save-session", session)              │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 │ async
                 │ (Promise)
                 │
    ┌────────────▼────────────┐
    │ IPC Main Thread Channel │
    └────────────┬────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Main Process                                    │
│                                                                     │
│  ipcMain.handle("storage-save-session", (event, session) => {     │
│    storageManager.saveSession(session)                            │
│  })                                                                 │
│           │                                                         │
│           ▼                                                         │
│  ElectronStorageManager.saveSession(session)                      │
│           │                                                         │
│           ▼                                                         │
│  better-sqlite3                                                    │
│  db.exec("BEGIN TRANSACTION")                                     │
│  ... save data ...                                                │
│  db.exec("COMMIT")                                                │
│           │                                                         │
│           ▼                                                         │
│  illusions-storage.db                                             │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 │ Response
                 │ (Promise resolves)
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Renderer Process                                 │
│                                                                     │
│  return value from await received                                 │
│  Promise resolves                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## 數據流程

### Electron 路徑
```
User Action
    ↓
React Component calls storage.saveSession()
    ↓
ElectronStorageProvider (IPC Client)
    ↓
ipcRenderer.invoke() → Main Process
    ↓
ElectronStorageManager (Main Process)
    ↓
better-sqlite3 (Sync)
    ↓
illusions-storage.db (SQLite)
    ↓
Disk (app.getPath('userData'))
```

### Web 路徑
```
User Action
    ↓
React Component calls storage.saveSession()
    ↓
WebStorageProvider
    ↓
Dexie (IndexedDB ORM)
    ↓
IndexedDB (Async)
    ↓
Browser Storage
```

## 類型定義層次

```
IStorageService (interface)
  ├── Core Methods:
  │   ├── initialize()
  │   ├── saveSession() / loadSession()
  │   ├── saveAppState() / loadAppState()
  │   ├── addToRecent() / getRecentFiles() / removeFromRecent()
  │   ├── saveEditorBuffer() / loadEditorBuffer()
  │   └── clearAll()
  │
  ├── Implementation 1: WebStorageProvider
  │   ├── Uses: WebStorageDatabase (Dexie)
  │   └── Storage: Browser IndexedDB
  │
  └── Implementation 2: ElectronStorageProvider
      ├── Uses: IPC via electronAPI
      └── Backend: ElectronStorageManager (main process)
```

## 文件組織

```
lib/
├── storage-types.ts
│   └── Core types and interfaces
│       ├── RecentFile
│       ├── AppState
│       ├── EditorBuffer
│       ├── StorageSession
│       └── IStorageService (interface)
│
├── storage-service.ts
│   └── Factory and Singleton
│       ├── createStorageService()
│       └── getStorageService()
│
├── web-storage.ts
│   └── Web Implementation
│       ├── WebStorageProvider
│       └── WebStorageDatabase (Dexie)
│
├── electron-storage.ts
│   └── Electron Renderer Implementation
│       └── ElectronStorageProvider (IPC Client)
│
├── electron-storage-manager.ts
│   └── Electron Main Process Implementation
│       └── ElectronStorageManager (SQLite)
│
└── storage-service-examples.ts
    └── Usage examples and patterns
```

## 初始化流程

```
App Startup
    ↓
getStorageService()
    ├─ Check: isElectronEnvironment()?
    │   ├─ YES: return new ElectronStorageProvider()
    │   └─ NO:  return new WebStorageProvider()
    │
    └─ Store in singleton instance
           ↓
await storage.initialize()
    ├─ Web:
    │   └─ Dexie.open() → IndexedDB ready
    │
    └─ Electron:
        └─ Marked initialized (real work in main process)
           ↓
await storage.loadSession()
    ├─ Web:  Query IndexedDB
    └─ Electron: ipcRenderer.invoke() → query SQLite
           ↓
Restore UI state / Show welcome / Open last file
```

## 數據持久化模型

### Electron (SQLite)

```
Table: app_state
┌───────┬───────────────────┬────────────┐
│ id    │ data (JSON)       │ updated_at │
├───────┼───────────────────┼────────────┤
│ app_s│ {"lastOpenedM...  │ 1704067200 │
└───────┴───────────────────┴────────────┘

Table: recent_files
┌────────────────────┬────────┬──────────────┬────────────┐
│ id                 │ path   │ data (JSON)  │ updated_at │
├────────────────────┼────────┼──────────────┼────────────┤
│ recent_/path/file1 │ /path/ │ {name, path..│ 1704067200 │
│ recent_/path/file2 │ /path/ │ {name, path..│ 1704067100 │
└────────────────────┴────────┴──────────────┴────────────┘

Table: editor_buffer
┌────────────────┬──────────────────┬────────────┐
│ id             │ data (JSON)      │ updated_at │
├────────────────┼──────────────────┼────────────┤
│ editor_buffer  │ {content, ts...  │ 1704067150 │
└────────────────┴──────────────────┴────────────┘
```

### Web (IndexedDB)

```
Database: IllusionsStorage

ObjectStore: appState
┌────────┬──────────────────────┐
│ id     │ data                 │
├────────┼──────────────────────┤
│ app_st │ { lastOpenedMdiPath: }
└────────┴──────────────────────┘

ObjectStore: recentFiles (indexed by: id, path)
┌────────────────────┬────────┬────────────────────┐
│ id                 │ path   │ data               │
├────────────────────┼────────┼────────────────────┤
│ recent_/path/file1 │ /path/ │ {name, path, ...}  │
│ recent_/path/file2 │ /path/ │ {name, path, ...}  │
└────────────────────┴────────┴────────────────────┘

ObjectStore: editorBuffer
┌────────────────┬──────────────────────┐
│ id             │ data                 │
├────────────────┼──────────────────────┤
│ editor_buffer  │ {content, timestamp} │
└────────────────┴──────────────────────┘
```

## 環境檢測邏輯

```
isElectronEnvironment()
    ↓
Check: typeof window !== 'undefined'?
    ├─ NO: return false (SSR or non-browser)
    │
    └─ YES: Check: window.electronAPI exists?
        ├─ YES: return true (Electron Renderer)
        └─ NO: return false (Browser/Web)
```

## 錯誤處理策略

```
try {
    await storage.operation()
} catch (error) {
    // Log error
    console.error("Operation failed:", error)
    
    // Electron: IPC timeout or main process error
    // Web: IndexedDB quota exceeded or corruption
    
    // Graceful degradation options:
    // 1. Retry with exponential backoff
    // 2. Use in-memory cache as fallback
    // 3. Notify user of sync failure
    // 4. Attempt recovery or reset
}
```

## 性能特性

| 操作 | Electron (SQLite) | Web (IndexedDB) |
|------|------------------|-----------------|
| saveSession | ~5ms (同步) | ~20ms (異步) |
| loadSession | ~5ms (同步) | ~15ms (異步) |
| addToRecent | ~3ms (同步) | ~10ms (異步) |
| getRecentFiles | ~2ms (同步) | ~8ms (異步) |
| saveEditorBuffer | ~2ms (同步) | ~12ms (異步) |
| loadEditorBuffer | ~2ms (同步) | ~10ms (異步) |

## 限制和註意事項

### Electron
- 同步操作可能阻塞 UI (已在主進程中執行避免)
- 數據庫文件位置依賴於 `app.getPath('userData')`
- 跨進程 IPC 有序列化限制 (使用 JSON)

### Web
- IndexedDB 配額通常為 50MB（取決於瀏覽器）
- 隱私瀏覽模式下不可用
- 受同源政策限制
- 異步 API 增加複雜性

### 通用
- 最近文件列表限制為 10 項
- 所有時間戳使用毫秒級 Unix 時間戳
- 編輯緩衝區不加密 (假設本地使用)
