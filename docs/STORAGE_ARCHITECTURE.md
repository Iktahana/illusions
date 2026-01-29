# Storage Service Architecture

## システム構成図

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Application (React/Next.js)                   │
│                     Uses: getStorageService()                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│            StorageService Factory (storage-service.ts)               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ createStorageService() - Environment Detection                │   │
│  │ getStorageService() - Singleton Instance                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
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
│  Provider            │                              │ Browser API  │   │
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
│ ┌────────────────────────────────────────┐   │                         │
│ │ ElectronStorageManager                 │   │                         │
│ │ (electron-storage-manager.ts)          │   │                         │
│ │                                        │   │                         │
│ │ better-sqlite3                         │   │                         │
│ │ (Synchronous API)                      │   │                         │
│ │                                        │   │                         │
│ │ ~/Library/Application Support/...      │   │                         │
│ │ illusions-storage.db                   │   │                         │
│ │                                        │   │                         │
│ │ Tables:                                │   │                         │
│ │ - app_state                            │   │                         │
│ │ - recent_files                         │   │                         │
│ │ - editor_buffer                        │   │                         │
│ └────────────────────────────────────────┘   │                         │
│                                              │                         │
│ Preload Script (electron/preload.ts)         │                         │
│ - Exposes storage API to renderer via        │                         │
│   contextBridge.exposeInMainWorld()          │                         │
└──────────────────────────────────────────────┘                         │
                                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

## IPC 通信フロー

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Renderer Process (Browser)                        │
│                                                                     │
│  await storage.saveSession(session)                                 │
│           │                                                         │
│           ▼                                                         │
│  ipcRenderer.invoke("storage-save-session", session)               │
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
│  ipcMain.handle("storage-save-session", (event, session) => {       │
│    storageManager.saveSession(session)                              │
│  })                                                                 │
│           │                                                         │
│           ▼                                                         │
│  ElectronStorageManager.saveSession(session)                        │
│           │                                                         │
│           ▼                                                         │
│  better-sqlite3                                                     │
│  db.exec("BEGIN TRANSACTION")                                      │
│  ... save data ...                                                 │
│  db.exec("COMMIT")                                                 │
│           │                                                         │
│           ▼                                                         │
│  illusions-storage.db                                              │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 │ Response
                 │ (Promise resolves)
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Renderer Process                                 │
│                                                                     │
│  return value from await received                                   │
│  Promise resolves                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## データモデル（概要）

- `AppState`: 最後に開いたファイルなどのアプリ状態
- `RecentFile[]`: 最近使用（最大 10 件）
- `EditorBuffer`: 未保存内容の復旧用バッファ

## 環境差分 / 制約

- Electron（SQLite）: 同期 API で高速、容量はディスク依存
- Web（IndexedDB）: 非同期、クォータ制限（目安 50MB）、プライベートブラウジングでは利用不可の場合あり

## エラーハンドリング方針（簡易）

- Web では IndexedDB の初期化失敗やクォータ超過を考慮
- Electron では IPC 未登録 / preload 未設定のケースを考慮
