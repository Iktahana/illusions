# Electron Integration Checklist

## 完整的 Electron 集成檢清單

按照以下步驟將 StorageService 集成到 Electron 應用中。

---

## ✅ 步驟 1: 安裝依賴

```bash
npm install better-sqlite3
```

- [ ] 已安裝 `better-sqlite3`
- [ ] `package.json` 中已添加依賴
- [ ] `npm install` 或 `yarn install` 已執行

---

## ✅ 步驟 2: 更新 `electron/main.ts`

### 2.1 添加導入

在檔案頂部 (在其他導入之後) 添加：

```typescript
import ElectronStorageManager from "../lib/electron-storage-manager.js";
import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "../lib/storage-types.js";
```

- [ ] 導入 `ElectronStorageManager`
- [ ] 導入所有必需的類型

### 2.2 創建存儲管理器實例

在 `let mainWindow: BrowserWindow | null = null;` 之後添加：

```typescript
const storageManager = new ElectronStorageManager();
```

- [ ] 創建全局 `storageManager` 實例

### 2.3 添加 IPC 處理器

在現有 IPC 處理器之後添加所有 14 個處理器：

```typescript
// ========== Storage IPC Handlers ==========

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

- [ ] 已添加所有 12 個 IPC 處理器
- [ ] 每個處理器都已驗證

### 2.4 添加清理代碼

在 `app.on("window-all-closed", ...)` 之前添加：

```typescript
app.on("before-quit", () => {
  storageManager.close();
});
```

- [ ] 已添加 `before-quit` 事件監聽器
- [ ] 確保在應用退出前關閉數據庫

---

## ✅ 步驟 3: 更新 `electron/preload.ts`

### 3.1 添加導入

在檔案頂部添加：

```typescript
import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "../lib/storage-types";
```

- [ ] 已導入存儲類型

### 3.2 添加 storage 對象到 electronAPI

在 `contextBridge.exposeInMainWorld("electronAPI", {` 內添加：

```typescript
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
```

- [ ] 已添加完整的 storage 對象
- [ ] 所有 12 個方法都已暴露

---

## ✅ 步驟 4: 驗證類型定義

檢查 `types/electron.d.ts` 是否已更新：

```typescript
import type { StorageSession, AppState, RecentFile, EditorBuffer } from "@/lib/storage-types";

declare global {
  interface ElectronAPI {
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
  }
}
```

- [ ] ✅ 已更新 (包含在實作中)

---

## ✅ 步驟 5: 代碼驗證

### 5.1 TypeScript 檢查

```bash
npm run type-check
```

- [ ] 無 TypeScript 錯誤
- [ ] 所有類型都正確解析

### 5.2 Linting

```bash
npm run lint
```

- [ ] 無 ESLint 錯誤
- [ ] 代碼風格一致

---

## ✅ 步驟 6: 應用層集成

### 6.1 添加啟動邏輯

在應用的主要元件或布局中：

```typescript
"use client";

import { useEffect } from "react";
import { getStorageService } from "@/lib/storage-service";

export function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const restore = async () => {
      const storage = getStorageService();
      const session = await storage.loadSession();

      if (session?.appState.lastOpenedMdiPath) {
        // 恢復最後使用的檔案
        // await openFile(session.appState.lastOpenedMdiPath);
      }

      if (session?.editorBuffer) {
        // 恢復未保存的內容
        // showRestorePrompt(session.editorBuffer.content);
      }
    };

    restore();
  }, []);

  return <>{children}</>;
}
```

- [ ] 已添加啟動恢復邏輯
- [ ] 應用可以加載先前的會話

### 6.2 添加自動保存

```typescript
useEffect(() => {
  const storage = getStorageService();
  const autoSaveInterval = setInterval(async () => {
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now(),
    });
  }, 30000); // 每 30 秒

  return () => clearInterval(autoSaveInterval);
}, [editorContent]);
```

- [ ] 已實現編輯緩衝區自動保存
- [ ] 定時器已正確設置

### 6.3 添加保存邏輯

```typescript
async function saveFile(filePath: string, content: string) {
  const storage = getStorageService();

  // ... 保存到檔案系統 ...

  // 更新最近使用
  await storage.addToRecent({
    name: path.basename(filePath),
    path: filePath,
    lastModified: Date.now(),
    snippet: content.substring(0, 100),
  });

  // 更新應用狀態
  await storage.saveAppState({
    lastOpenedMdiPath: filePath,
  });

  // 清除緩衝區
  await storage.clearEditorBuffer();
}
```

- [ ] 已添加保存邏輯
- [ ] 最近文件列表已更新
- [ ] 緩衝區已清除

---

## ✅ 步驟 7: 測試

### 7.1 基本測試

```bash
npm run electron:dev
```

1. 在開發者工具控制台中測試：

```javascript
const { electronAPI } = window;
const session = await electronAPI.storage.loadSession();
console.log("Session:", session);
```

- [ ] 可以調用 `electronAPI.storage` 方法
- [ ] 無 IPC 超時錯誤

### 7.2 數據持久化測試

```javascript
// 保存數據
await electronAPI.storage.saveAppState({
  lastOpenedMdiPath: "/test/path.mdi"
});

// 刷新應用並重新檢查
await electronAPI.storage.loadAppState();
```

- [ ] 保存的數據在應用重啟後仍存在
- [ ] 沒有數據丟失

### 7.3 驗證數據庫

```bash
sqlite3 ~/Library/Application\ Support/Illusions/illusions-storage.db
```

```sql
SELECT * FROM app_state;
SELECT * FROM recent_files;
SELECT * FROM editor_buffer;
```

- [ ] 可以看到所有保存的數據
- [ ] 表結構正確

### 7.4 運行測試套件

在控制台中：

```javascript
import { StorageServiceTestSuite } from "@/lib/storage-service-tests";
const suite = new StorageServiceTestSuite();
await suite.runAll();
```

- [ ] 所有測試通過
- [ ] 沒有錯誤或警告

---

## ✅ 步驟 8: 構建和部署

### 8.1 生產構建

```bash
npm run build
```

- [ ] 構建成功完成
- [ ] 無錯誤

### 8.2 Electron 構建

```bash
npm run electron:build
```

- [ ] Electron 應用構建成功
- [ ] `.dmg` / `.exe` / `.AppImage` 已生成

### 8.3 安裝測試

在真實安裝上測試應用：

- [ ] 應用可以啟動
- [ ] 存儲功能正常工作
- [ ] 沒有白屏或崩潰

---

## ✅ 常見問題排查

### 問題：IPC 超時

**解決方案**:
- [ ] 確認 IPC 處理器已在 main.ts 中註冊
- [ ] 檢查處理器名稱是否匹配 (preload.ts 中的 invoke 調用)
- [ ] 確認 preload.ts 已正確引用

### 問題：類型錯誤 "storage is undefined"

**解決方案**:
- [ ] 檢查 `types/electron.d.ts` 中的 storage 定義
- [ ] 確認 TypeScript 配置正確編譯
- [ ] 執行 `npm run type-check`

### 問題：數據未持久化

**解決方案**:
- [ ] 檢查 `app.getPath('userData')` 目錄的寫入權限
- [ ] 查看 main.ts 中是否正確初始化了 SQLite
- [ ] 確認 `storageManager.close()` 被調用

### 問題：應用啟動時崩潰

**解決方案**:
- [ ] 檢查 `better-sqlite3` 是否正確安裝
- [ ] 查看 Electron 開發者工具中的錯誤
- [ ] 確認所有導入路徑都正確

---

## ✅ 驗證清單

最終驗證：

- [ ] `electron/main.ts` 已更新 ✓
- [ ] `electron/preload.ts` 已更新 ✓
- [ ] `types/electron.d.ts` 已更新 ✓
- [ ] `better-sqlite3` 已安裝
- [ ] TypeScript 編譯無錯誤
- [ ] ESLint 檢查通過
- [ ] 應用可以啟動 (開發環境)
- [ ] 應用可以啟動 (生產環境)
- [ ] 數據持久化有效
- [ ] 所有測試通過
- [ ] 數據庫文件在正確位置
- [ ] 沒有控制台錯誤

---

## 📚 參考文件

- `STORAGE_INTEGRATION.md` - 詳細集成指南
- `STORAGE_ARCHITECTURE.md` - 系統架構
- `STORAGE_QUICK_REFERENCE.md` - API 參考
- `storage-service-examples.ts` - 代碼示例
- `storage-service-tests.ts` - 測試套件

---

## 🎯 下一步

完成所有檢查項後：

1. 在應用中實現所有必需的功能
2. 在真實環境中進行全面測試
3. 監控生產環境的任何問題
4. 根據需要進行優化

---

**完成日期**: ___________

**檢查者**: ___________

**備註**: ___________
