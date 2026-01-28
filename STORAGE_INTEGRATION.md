# Storage Service Integration Guide

本指南說明如何將 `StorageService` 整合到現有的 Electron 和 Web 應用中。

## 概述

`StorageService` 是一個環境感知的數據持久化抽象層，提供統一的 API：

- **Electron 環境**: 使用 SQLite (via `better-sqlite3`) 存儲在 `app.getPath('userData')`
- **Web 環境**: 使用 IndexedDB (via Dexie) 存儲在瀏覽器

## 檔案結構

```
lib/
├── storage-types.ts          # 介面定義和類型
├── web-storage.ts            # Web 實作 (IndexedDB)
├── electron-storage.ts       # Electron 實作 (IPC 客戶端)
├── electron-storage-manager.ts # Electron 主進程管理器
└── storage-service.ts        # 工廠函式和單一實例
```

## 步驟 1: 安裝依賴

### 已經安裝的依賴
- `dexie@^4.2.1` - 用於 Web IndexedDB

### 需要安裝的依賴

```bash
npm install better-sqlite3 --save
# 或使用 yarn
yarn add better-sqlite3
```

## 步驟 2: 更新 Electron 主進程 (`electron/main.ts`)

在 `electron/main.ts` 中新增以下程式碼：

### 1. 在檔案頂部匯入

```typescript
import ElectronStorageManager from "../lib/electron-storage-manager.js";
import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "../lib/storage-types.js";
```

### 2. 建立全域儲存管理器實例

在 `let mainWindow: BrowserWindow | null = null;` 之後新增：

```typescript
const storageManager = new ElectronStorageManager();
```

### 3. 新增 IPC 處理器

在現有的 IPC 處理器之後新增：

```typescript
// Storage IPC handlers
ipcMain.handle("storage-save-session", (
  _event: Electron.IpcMainInvokeEvent,
  session: StorageSession
) => {
  storageManager.saveSession(session);
});

ipcMain.handle("storage-load-session", () => {
  return storageManager.loadSession();
});

ipcMain.handle("storage-save-app-state", (
  _event: Electron.IpcMainInvokeEvent,
  appState: AppState
) => {
  storageManager.saveAppState(appState);
});

ipcMain.handle("storage-load-app-state", () => {
  return storageManager.loadAppState();
});

ipcMain.handle("storage-add-to-recent", (
  _event: Electron.IpcMainInvokeEvent,
  file: RecentFile
) => {
  storageManager.addToRecent(file);
});

ipcMain.handle("storage-get-recent-files", () => {
  return storageManager.getRecentFiles();
});

ipcMain.handle("storage-remove-from-recent", (
  _event: Electron.IpcMainInvokeEvent,
  filePath: string
) => {
  storageManager.removeFromRecent(filePath);
});

ipcMain.handle("storage-clear-recent", () => {
  storageManager.clearRecent();
});

ipcMain.handle("storage-save-editor-buffer", (
  _event: Electron.IpcMainInvokeEvent,
  buffer: EditorBuffer
) => {
  storageManager.saveEditorBuffer(buffer);
});

ipcMain.handle("storage-load-editor-buffer", () => {
  return storageManager.loadEditorBuffer();
});

ipcMain.handle("storage-clear-editor-buffer", () => {
  storageManager.clearEditorBuffer();
});

ipcMain.handle("storage-clear-all", () => {
  storageManager.clearAll();
});
```

### 4. 在應用終止時清理

在 `app.on("window-all-closed", ...)` 之前新增：

```typescript
app.on("before-quit", () => {
  storageManager.close();
});
```

## 步驟 3: 更新 Electron 預載指令碼 (`electron/preload.ts`)

在 `contextBridge.exposeInMainWorld` 中新增 `storage` 物件：

```typescript
import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "../lib/storage-types";

contextBridge.exposeInMainWorld("electronAPI", {
  // ... existing exports ...

  storage: {
    saveSession: (session: StorageSession) =>
      ipcRenderer.invoke("storage-save-session", session),
    loadSession: () =>
      ipcRenderer.invoke("storage-load-session"),
    saveAppState: (appState: AppState) =>
      ipcRenderer.invoke("storage-save-app-state", appState),
    loadAppState: () =>
      ipcRenderer.invoke("storage-load-app-state"),
    addToRecent: (file: RecentFile) =>
      ipcRenderer.invoke("storage-add-to-recent", file),
    getRecentFiles: () =>
      ipcRenderer.invoke("storage-get-recent-files"),
    removeFromRecent: (filePath: string) =>
      ipcRenderer.invoke("storage-remove-from-recent", filePath),
    clearRecent: () =>
      ipcRenderer.invoke("storage-clear-recent"),
    saveEditorBuffer: (buffer: EditorBuffer) =>
      ipcRenderer.invoke("storage-save-editor-buffer", buffer),
    loadEditorBuffer: () =>
      ipcRenderer.invoke("storage-load-editor-buffer"),
    clearEditorBuffer: () =>
      ipcRenderer.invoke("storage-clear-editor-buffer"),
    clearAll: () =>
      ipcRenderer.invoke("storage-clear-all"),
  },
});
```

## 步驟 4: 在你的應用中使用

### 基本用法

```typescript
import { getStorageService } from "@/lib/storage-service";
import type { RecentFile } from "@/lib/storage-types";

const storage = getStorageService();

// 初始化 (第一次使用時自動進行)
await storage.initialize();

// 儲存當前工作區狀態
await storage.saveSession({
  appState: {
    lastOpenedMdiPath: "/path/to/file.mdi",
  },
  recentFiles: [],
  editorBuffer: {
    content: "draft content",
    timestamp: Date.now(),
  },
});

// 加載先前的狀態
const session = await storage.loadSession();
if (session) {
  console.log("Last opened file:", session.appState.lastOpenedMdiPath);
}

// 新增到最近使用列表
const recentFile: RecentFile = {
  name: "Document.mdi",
  path: "/path/to/Document.mdi",
  lastModified: Date.now(),
  snippet: "First few lines of content...",
};
await storage.addToRecent(recentFile);

// 獲取最近使用的檔案
const recent = await storage.getRecentFiles();
console.log("Recent files:", recent);

// 保存編輯緩衝區 (用於崩潰恢復)
await storage.saveEditorBuffer({
  content: "unsaved work",
  timestamp: Date.now(),
});

// 在應用啟動時恢復
const buffer = await storage.loadEditorBuffer();
if (buffer) {
  console.log("Restoring unsaved content:", buffer.content);
}
```

### 在元件中使用

```typescript
"use client";

import { useEffect, useState } from "react";
import { getStorageService } from "@/lib/storage-service";
import type { StorageSession } from "@/lib/storage-types";

export function MyComponent() {
  const [session, setSession] = useState<StorageSession | null>(null);

  useEffect(() => {
    const storage = getStorageService();

    const loadSession = async () => {
      const loaded = await storage.loadSession();
      setSession(loaded);
    };

    loadSession();
  }, []);

  return (
    <div>
      {session?.appState.lastOpenedMdiPath && (
        <p>Last opened: {session.appState.lastOpenedMdiPath}</p>
      )}
    </div>
  );
}
```

## 步驟 5: 更新 TypeScript 定義 (可選)

如果你在 `types/electron.d.ts` 中有 Electron API 定義，可以新增：

```typescript
declare global {
  interface Window {
    electronAPI: {
      // ... existing properties ...
      storage?: {
        saveSession: (session: StorageSession) => Promise<void>;
        loadSession: () => Promise<StorageSession | null>;
        saveAppState: (appState: AppState) => Promise<void>;
        loadAppState: () => Promise<AppState | null>;
        addToRecent: (file: RecentFile) => Promise<void>;
        getRecentFiles: () => Promise<RecentFile[]>;
        removeFromRecent: (filePath: string) => Promise<void>;
        clearRecent: () => Promise<void>;
        saveEditorBuffer: (buffer: EditorBuffer) => Promise<void>;
        loadEditorBuffer: () => Promise<EditorBuffer | null>;
        clearEditorBuffer: () => Promise<void>;
        clearAll: () => Promise<void>;
      };
    };
  }
}
```

## 常見使用場景

### 場景 1: 應用啟動時恢復狀態

```typescript
// app/layout.tsx 或主要應用元件
useEffect(() => {
  const storage = getStorageService();

  const restore = async () => {
    const session = await storage.loadSession();

    if (session?.appState.lastOpenedMdiPath) {
      // 自動開啟最後使用的檔案
      await openFile(session.appState.lastOpenedMdiPath);
    }

    if (session?.editorBuffer) {
      // 提示使用者恢復未保存的內容
      showRestorePrompt(session.editorBuffer.content);
    }
  };

  restore();
}, []);
```

### 場景 2: 定期自動保存編輯緩衝區

```typescript
useEffect(() => {
  const storage = getStorageService();
  const interval = setInterval(async () => {
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now(),
    });
  }, 30000); // 每 30 秒自動保存

  return () => clearInterval(interval);
}, [editorContent]);
```

### 場景 3: 當使用者打開或保存檔案時更新最近使用列表

```typescript
async function openFile(filePath: string) {
  const storage = getStorageService();

  // ... 打開檔案的邏輯 ...

  const fileName = path.basename(filePath);
  const snippet = getFirstNLines(content, 3);

  await storage.addToRecent({
    name: fileName,
    path: filePath,
    lastModified: Date.now(),
    snippet,
  });
}
```

## 資料庫位置

- **Electron**: `~/Library/Application Support/Illusions/illusions-storage.db` (macOS)
  或 `%APPDATA%\Illusions\illusions-storage.db` (Windows)
- **Web**: 瀏覽器 IndexedDB (需要瀏覽器開發者工具檢視)

## 故障排除

### Electron 中出現 "Electron storage API not available" 錯誤

確認：
1. `electron/preload.ts` 已正確更新
2. 預載指令碼已正確建立 (參考 `electron/main.ts` 中的 `webPreferences.preload`)
3. IPC 處理器已在主進程中註冊

### Web 中 IndexedDB 無法初始化

- 檢查瀏覽器是否允許 IndexedDB
- 檢查瀏覽器控制台是否有錯誤訊息
- 在隱私瀏覽模式下，IndexedDB 可能受限

## API 參考

### `StorageSession`

```typescript
interface StorageSession {
  appState: AppState;
  recentFiles: RecentFile[];
  editorBuffer: EditorBuffer | null;
}
```

### `RecentFile`

```typescript
interface RecentFile {
  name: string;           // 檔案名稱
  path: string;          // 檔案路徑或 Handle
  lastModified: number;  // 時間戳 (毫秒)
  snippet?: string;      // 檔案內容預覽
}
```

### 主要方法

- `initialize()` - 初始化儲存服務
- `saveSession(session)` - 保存完整工作區狀態
- `loadSession()` - 加載完整工作區狀態
- `saveAppState(appState)` - 保存應用狀態
- `loadAppState()` - 加載應用狀態
- `addToRecent(file)` - 新增到最近使用 (限制 10 筆)
- `getRecentFiles()` - 獲取最近使用的檔案
- `removeFromRecent(path)` - 從最近使用中移除
- `clearRecent()` - 清除所有最近使用的檔案
- `saveEditorBuffer(buffer)` - 保存編輯緩衝區
- `loadEditorBuffer()` - 加載編輯緩衝區
- `clearEditorBuffer()` - 清除編輯緩衝區
- `clearAll()` - 清除所有資料

## 性能考量

- **Electron**: `better-sqlite3` 提供同步 API，高效且可預測
- **Web**: IndexedDB 操作是非同步的，所有 API 返回 Promise
- 最近使用列表限制為 10 筆以保持效能
- 編輯緩衝區應定期保存 (建議 30 秒)
