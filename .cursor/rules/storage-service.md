# Storage Service Rule

## 概述

此項目已實現 **Web/Electron 通用的數據持久化抽象層 (StorageService)**。

提醒所有開發人員使用這個統一的存儲服務，而不是自己實現存儲邏輯。

## 核心位置

```
lib/
├── storage-types.ts              # 核心介面定義
├── storage-service.ts            # 工廠函式 (getStorageService)
├── web-storage.ts                # Web 實作 (IndexedDB)
├── electron-storage.ts           # Electron 實作 (IPC)
├── electron-storage-manager.ts   # Electron 主進程
├── storage-service-examples.ts   # 使用示例
└── storage-service-tests.ts      # 測試套件
```

文檔:
- `STORAGE_INDEX.md` - 快速導航（必讀！）
- `STORAGE_INTEGRATION.md` - 集成指南
- `STORAGE_ARCHITECTURE.md` - 架構詳解
- `STORAGE_QUICK_REFERENCE.md` - API 查詢
- `ELECTRON_INTEGRATION_CHECKLIST.md` - 集成檢清單

## 快速使用

### 基本用法

```typescript
import { getStorageService } from "@/lib/storage-service";

const storage = getStorageService();

// 保存會話
await storage.saveSession({
  appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
  recentFiles: [],
  editorBuffer: { content: "...", timestamp: Date.now() }
});

// 加載會話
const session = await storage.loadSession();
```

### 最近文件管理

```typescript
// 新增到最近使用 (自動限制 10 項)
await storage.addToRecent({
  name: "Document.mdi",
  path: "/path/to/Document.mdi",
  lastModified: Date.now(),
  snippet: "Content preview"
});

// 獲取列表
const recent = await storage.getRecentFiles();
```

### 自動保存

```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now()
    });
  }, 30000); // 每 30 秒

  return () => clearInterval(interval);
}, [editorContent]);
```

## 核心功能

### 12 個 API 方法

| 方法 | 用途 |
|------|------|
| `initialize()` | 初始化 |
| `saveSession()` | 保存完整會話 |
| `loadSession()` | 加載完整會話 |
| `saveAppState()` | 保存應用狀態 |
| `loadAppState()` | 加載應用狀態 |
| `addToRecent()` | 新增到最近文件 |
| `getRecentFiles()` | 獲取最近文件 |
| `removeFromRecent()` | 移除最近文件 |
| `clearRecent()` | 清除最近文件 |
| `saveEditorBuffer()` | 保存編輯緩衝區 |
| `loadEditorBuffer()` | 加載編輯緩衝區 |
| `clearEditorBuffer()` | 清除編輯緩衝區 |

## 數據結構

### StorageSession

```typescript
{
  appState: { lastOpenedMdiPath?: string },
  recentFiles: RecentFile[],  // 最多 10 項
  editorBuffer: EditorBuffer | null
}
```

### RecentFile

```typescript
{
  name: string;              // 檔案名稱
  path: string;             // 檔案路徑
  lastModified: number;     // 時間戳
  snippet?: string;         // 內容預覽
}
```

### EditorBuffer

```typescript
{
  content: string;          // 編輯內容
  timestamp: number;        // 時間戳
}
```

## 環境差異

### Electron
- 存儲: SQLite (via `better-sqlite3`)
- 位置: `~/Library/Application Support/Illusions/illusions-storage.db`
- 操作: 同步（在主進程）
- 通訊: IPC (ipcRenderer.invoke / ipcMain.handle)

### Web
- 存儲: IndexedDB (via Dexie)
- 操作: 異步 (Promises)
- 配額: ~50MB
- 位置: 瀏覽器存儲

## 常見模式

### 模式 1: 應用啟動恢復

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

### 模式 2: 保存時更新

```typescript
async function saveFile(path: string, content: string) {
  const storage = getStorageService();

  // 保存到檔案系統
  // ...

  // 更新最近使用
  await storage.addToRecent({
    name: path.split("/").pop(),
    path,
    lastModified: Date.now(),
    snippet: content.substring(0, 100)
  });

  // 更新應用狀態
  await storage.saveAppState({ lastOpenedMdiPath: path });

  // 清除緩衝區
  await storage.clearEditorBuffer();
}
```

### 模式 3: React 組件

```typescript
"use client";

import { useEffect, useState } from "react";
import { getStorageService } from "@/lib/storage-service";
import type { StorageSession } from "@/lib/storage-types";

export function MyComponent() {
  const [session, setSession] = useState<StorageSession | null>(null);

  useEffect(() => {
    const load = async () => {
      const storage = getStorageService();
      const loaded = await storage.loadSession();
      setSession(loaded);
    };

    load();
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

## 不要做什麼 ❌

- ❌ 不要實現自己的存儲邏輯
- ❌ 不要直接使用 localStorage (在 Electron 中)
- ❌ 不要直接操作 IndexedDB
- ❌ 不要手動管理 SQLite 數據庫

要做什麼 ✅

- ✅ 始終使用 `getStorageService()`
- ✅ 使用統一的 API
- ✅ 依賴自動環境檢測
- ✅ 定期保存狀態

## 集成檢清單 (Electron Only)

如果需要在 Electron 中使用，確認：

- [ ] 已安裝 `better-sqlite3`: `npm install better-sqlite3`
- [ ] `electron/main.ts` 已更新 IPC 處理器
- [ ] `electron/preload.ts` 已暴露 storage API
- [ ] `types/electron.d.ts` 已更新 (已完成 ✓)
- [ ] 應用層可以調用 `getStorageService()`

參考: `ELECTRON_INTEGRATION_CHECKLIST.md`

## 文檔

快速查詢:

| 需求 | 文檔 |
|------|------|
| 快速導航 | `STORAGE_INDEX.md` |
| 集成步驟 | `ELECTRON_INTEGRATION_CHECKLIST.md` |
| API 查詢 | `STORAGE_QUICK_REFERENCE.md` |
| 架構詳解 | `STORAGE_ARCHITECTURE.md` |
| 詳細說明 | `STORAGE_IMPLEMENTATION.md` |
| 代碼示例 | `lib/storage-service-examples.ts` |
| 運行測試 | `lib/storage-service-tests.ts` |

## 測試

運行完整測試套件：

```typescript
import { StorageServiceTestSuite } from "@/lib/storage-service-tests";

const suite = new StorageServiceTestSuite();
await suite.runAll();
```

或在瀏覽器控制台：

```javascript
await window.runStorageTests();
```

## 設計原則

1. **統一 API** - 相同代碼在 Electron 和 Web 中運行
2. **自動環境檢測** - 無需手動配置
3. **類型安全** - 完整 TypeScript 支援
4. **高效能** - Electron 同步，Web 異步
5. **易於使用** - 簡單直觀的 API
6. **可靠** - 完整的錯誤處理
7. **可擴展** - 易於添加新功能

## 性能考量

- 最近文件自動限制為 10 項
- 編輯緩衝區應定期保存 (建議 30 秒)
- 批量操作使用 `saveSession()` 而非個別保存
- Electron: ~2-5ms 每操作
- Web: ~10-20ms 每操作

## 常見問題

**Q: 我應該在何時調用 initialize()?**
A: 不需要顯式調用，第一次使用時自動調用。

**Q: 編輯緩衝區是加密的嗎?**
A: 否，假設本地使用。需要時自行實現加密。

**Q: 多個應用實例會衝突嗎?**
A: Electron 使用 WAL 模式避免衝突，Web 使用 IndexedDB 鎖定。

**Q: 我可以改變最近文件限制嗎?**
A: 可以，編輯相關實作中的常數。

**Q: 如何遷移舊的存儲?**
A: 需要編寫遷移指令碼讀取舊數據並使用新 API 保存。

## 版本信息

- **版本**: 1.0.0
- **狀態**: 生產就緒
- **最後更新**: 2026-01-28
- **依賴**: `better-sqlite3` (Electron), `dexie@^4.2.1` (Web)
