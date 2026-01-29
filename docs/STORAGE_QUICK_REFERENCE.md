# Storage Service Quick Reference

## 快速開始

### 1. 基本使用

```typescript
import { getStorageService } from "@/lib/storage-service";

const storage = getStorageService();

// 自動初始化 (第一次調用時)
await storage.initialize();
```

### 2. 保存和加載會話

```typescript
// 保存完整會話
await storage.saveSession({
  appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
  recentFiles: [],
  editorBuffer: { content: "...", timestamp: Date.now() },
});

// 加載會話
const session = await storage.loadSession();
```

### 3. 管理最近使用的檔案

```typescript
// 新增檔案到最近使用 (自動限制為 10 筆)
await storage.addToRecent({
  name: "Document.mdi",
  path: "/path/to/Document.mdi",
  lastModified: Date.now(),
  snippet: "Content preview...",
});

// 獲取最近使用的檔案
const recent = await storage.getRecentFiles();

// 移除特定檔案
await storage.removeFromRecent("/path/to/file.mdi");

// 清除所有最近使用的檔案
await storage.clearRecent();
```

### 4. 編輯緩衝區 (自動保存/崩潰恢復)

```typescript
// 自動保存編輯內容
await storage.saveEditorBuffer({
  content: editorContent,
  timestamp: Date.now(),
});

// 恢復未保存的內容
const buffer = await storage.loadEditorBuffer();
if (buffer) {
  console.log("Recovered content:", buffer.content);
}

// 清除緩衝區
await storage.clearEditorBuffer();
```

### 5. 應用狀態

```typescript
// 保存應用狀態
await storage.saveAppState({
  lastOpenedMdiPath: "/path/to/file.mdi",
});

// 加載應用狀態
const appState = await storage.loadAppState();
```

### 6. 清除所有數據

```typescript
await storage.clearAll(); // ⚠️ 不可逆
```

## API 速查表

```typescript
interface IStorageService {
  // 初始化
  initialize(): Promise<void>;

  // 完整會話
  saveSession(session: StorageSession): Promise<void>;
  loadSession(): Promise<StorageSession | null>;

  // 應用狀態
  saveAppState(appState: AppState): Promise<void>;
  loadAppState(): Promise<AppState | null>;

  // 最近使用
  addToRecent(file: RecentFile): Promise<void>;
  getRecentFiles(): Promise<RecentFile[]>;
  removeFromRecent(path: string): Promise<void>;
  clearRecent(): Promise<void>;

  // 編輯緩衝區
  saveEditorBuffer(buffer: EditorBuffer): Promise<void>;
  loadEditorBuffer(): Promise<EditorBuffer | null>;
  clearEditorBuffer(): Promise<void>;

  // 清除所有
  clearAll(): Promise<void>;
}
```

## 型別定義

```typescript
interface RecentFile {
  name: string;           // 檔案名稱
  path: string;          // 檔案路徑
  lastModified: number;  // 時間戳 (毫秒)
  snippet?: string;      // 內容預覽
}

interface AppState {
  lastOpenedMdiPath?: string;
}

interface EditorBuffer {
  content: string;      // 編輯內容
  timestamp: number;    // 時間戳
}

interface StorageSession {
  appState: AppState;
  recentFiles: RecentFile[];
  editorBuffer: EditorBuffer | null;
}
```

## 常見模式

### 模式 1: 應用啟動恢復

```typescript
useEffect(() => {
  const restore = async () => {
    const storage = getStorageService();
    const session = await storage.loadSession();

    if (session?.appState.lastOpenedMdiPath) {
      // 打開上次使用的檔案
      await openFile(session.appState.lastOpenedMdiPath);
    }

    if (session?.editorBuffer) {
      // 恢復未保存的內容
      restoreContent(session.editorBuffer.content);
    }
  };

  restore();
}, []);
```

### 模式 2: 定期自動保存

```typescript
useEffect(() => {
  const storage = getStorageService();

  const interval = setInterval(async () => {
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now(),
    });
  }, 30000); // 每 30 秒

  return () => clearInterval(interval);
}, [editorContent]);
```

### 模式 3: 保存時更新最近使用

```typescript
async function saveFile(path: string, content: string) {
  const storage = getStorageService();

  // 保存到檔案系統
  // ...

  // 更新最近使用列表
  await storage.addToRecent({
    name: path.split("/").pop() || "Untitled",
    path,
    lastModified: Date.now(),
    snippet: content.substring(0, 100),
  });

  // 清除緩衝區
  await storage.clearEditorBuffer();
}
```

### 模式 4: 最近使用菜單

```typescript
async function displayRecentMenu() {
  const storage = getStorageService();
  const recent = await storage.getRecentFiles();

  return (
    <div className="menu">
      {recent.map((file) => (
        <div key={file.path} onClick={() => openFile(file.path)}>
          <div className="name">{file.name}</div>
          <div className="snippet">{file.snippet}</div>
          <div className="date">
            {new Date(file.lastModified).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 模式 5: 應用關閉前保存狀態

```typescript
useEffect(() => {
  const handleBeforeUnload = async () => {
    const storage = getStorageService();

    await storage.saveSession({
      appState: { lastOpenedMdiPath: currentFilePath },
      recentFiles: await storage.getRecentFiles(),
      editorBuffer: {
        content: editorContent,
        timestamp: Date.now(),
      },
    });
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, [currentFilePath, editorContent]);
```

## 環境差異

### Electron
- ✅ 同步操作
- ✅ SQLite 高效
- ✅ 無大小限制 (取決於磁碟)
- ❌ 需要主進程 IPC

### Web (IndexedDB)
- ✅ 跨瀏覽器相容
- ✅ 無需後端
- ❌ 異步 API
- ❌ 配額限制 (~50MB)
- ❌ 隱私模式不可用

## 調試

### 檢視 Electron 數據庫

```bash
# 本地化路徑
~/Library/Application\ Support/Illusions/illusions-storage.db

# 使用 sqlite3 CLI
sqlite3 ~/Library/Application\ Support/Illusions/illusions-storage.db

# SQL 查詢
.schema
SELECT * FROM app_state;
SELECT * FROM recent_files;
SELECT * FROM editor_buffer;
```

### 檢視 Web IndexedDB

1. 打開瀏覽器開發者工具 (F12)
2. 進入 Application 標籤
3. 展開 IndexedDB
4. 選擇 "IllusionsStorage"
5. 查看 appState, recentFiles, editorBuffer

### 錯誤日誌

所有操作都在控制台記錄詳細錯誤：

```typescript
// 啟用詳細日誌 (開發模式)
const storage = getStorageService();
await storage.initialize(); // 檢查控制台輸出
```

## 性能最佳實踐

1. **初始化一次**: 使用 `getStorageService()` 獲取單一實例
2. **批量操作**: 優先使用 `saveSession()` 而非個別保存
3. **自動保存間隔**: 建議 30-60 秒
4. **最近文件限制**: 自動限制為 10 筆 (不要更改)
5. **編輯緩衝區**: 避免頻繁更新大型內容

## 常見問題

**Q: 我如何在 Web 和 Electron 間共享數據?**
A: 無法直接共享。Web 使用 IndexedDB，Electron 使用 SQLite。

**Q: 多個標籤頁會衝突嗎?**
A: Web 版本中，IndexedDB 的鎖定機制防止衝突。Electron 中無此問題。

**Q: 如何加密敏感數據?**
A: 需要自己在保存前加密，加載後解密。

**Q: 我可以改變最近文件的數量限制嗎?**
A: 可以，編輯 `addToRecent()` 中的 `if (allFiles.length > 10)` 部分。

**Q: 編輯緩衝區有大小限制嗎?**
A: Electron 無限制，Web IndexedDB ~50MB。

## 快速集成檢清單

- [ ] 安裝 `better-sqlite3` (Electron)
- [ ] 更新 `electron/main.ts` 以新增 IPC 處理器
- [ ] 更新 `electron/preload.ts` 以暴露存儲 API
- [ ] 導入並使用 `getStorageService()`
- [ ] 在應用啟動時調用 `loadSession()`
- [ ] 在編輯器中設置自動保存
- [ ] 在應用關閉時保存最終狀態
- [ ] 測試 Electron 和 Web 版本
- [ ] 檢查開發者工具中的持久化
