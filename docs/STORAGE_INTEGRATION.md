# Storage Service 統合ガイド

このガイドでは、`StorageService` を既存の Electron / Web アプリに統合する方法を説明します。

## 概要

`StorageService` は実行環境（Electron / Web）を判定して、同じ API でデータ永続化を提供する抽象レイヤーです。

- **Electron 環境**: SQLite（`better-sqlite3`）を利用し、`app.getPath('userData')` 配下へ保存
- **Web 環境**: IndexedDB（Dexie）を利用し、ブラウザに保存

## ファイル構成

```
lib/
├── storage-types.ts            # インターフェース/型定義
├── web-storage.ts              # Web 実装（IndexedDB）
├── electron-storage.ts         # Electron 実装（IPC クライアント）
├── electron-storage-manager.ts # Electron メインプロセス側マネージャー
└── storage-service.ts          # ファクトリ関数とシングルトン
```

## 手順 1: 依存関係のインストール

### 既に入っている依存

- `dexie@^4.2.1` - Web（IndexedDB）用

### 追加で必要な依存

```bash
npm install better-sqlite3 --save
# または yarn
yarn add better-sqlite3
```

## 手順 2: Electron メインプロセスの更新（`electron/main.ts`）

`electron/main.ts` に以下を追加します。

### 1. ファイル先頭で import

```typescript
import ElectronStorageManager from "../lib/electron-storage-manager.js";
import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "../lib/storage-types.js";
```

### 2. グローバルなストレージマネージャーを作成

`let mainWindow: BrowserWindow | null = null;` の後に追加します。

```typescript
const storageManager = new ElectronStorageManager();
```

### 3. IPC ハンドラーを追加

既存の IPC ハンドラーに続けて追加します。

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

### 4. アプリ終了時のクリーンアップ

`app.on("window-all-closed", ...)` より前に追加します。

```typescript
app.on("before-quit", () => {
  storageManager.close();
});
```

## 手順 3: Electron preload の更新（`electron/preload.ts`）

`contextBridge.exposeInMainWorld` に `storage` オブジェクトを追加します。

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

## 手順 4: アプリ側で使う

### 基本的な使い方

```typescript
import { getStorageService } from "@/lib/storage-service";
import type { RecentFile } from "@/lib/storage-types";

const storage = getStorageService();

// 初期化（初回利用時に自動で行われます）
await storage.initialize();

// 現在のワークスペース状態を保存
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

// 以前の状態を読み込み
const session = await storage.loadSession();
if (session) {
  console.log("Last opened file:", session.appState.lastOpenedMdiPath);
}

// 最近使用に追加
const recentFile: RecentFile = {
  name: "Document.mdi",
  path: "/path/to/Document.mdi",
  lastModified: Date.now(),
  snippet: "First few lines of content...",
};
await storage.addToRecent(recentFile);

// 最近使用ファイルの取得
const recent = await storage.getRecentFiles();
console.log("Recent files:", recent);

// エディタバッファの保存（クラッシュ復旧用途）
await storage.saveEditorBuffer({
  content: "unsaved work",
  timestamp: Date.now(),
});

// 起動時に復旧
const buffer = await storage.loadEditorBuffer();
if (buffer) {
  console.log("Restoring unsaved content:", buffer.content);
}
```

### コンポーネント内での例

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

## 手順 5: TypeScript 定義の更新（任意）

`types/electron.d.ts` に Electron API の型定義がある場合は、必要に応じて追記できます。

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

## よくある利用シナリオ

### シナリオ 1: 起動時に状態を復元

```typescript
// app/layout.tsx または主要コンポーネント
useEffect(() => {
  const storage = getStorageService();

  const restore = async () => {
    const session = await storage.loadSession();

    if (session?.appState.lastOpenedMdiPath) {
      // 最後に開いていたファイルを自動で開く
      await openFile(session.appState.lastOpenedMdiPath);
    }

    if (session?.editorBuffer) {
      // 未保存内容の復元をユーザーに提案
      showRestorePrompt(session.editorBuffer.content);
    }
  };

  restore();
}, []);
```

### シナリオ 2: エディタバッファを定期的に自動保存

```typescript
useEffect(() => {
  const storage = getStorageService();
  const interval = setInterval(async () => {
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now(),
    });
  }, 30000); // 30 秒ごとに自動保存

  return () => clearInterval(interval);
}, [editorContent]);
```

### シナリオ 3: ファイルの open / save 時に最近使用を更新

```typescript
async function openFile(filePath: string) {
  const storage = getStorageService();

  // ... ファイルを開く処理 ...

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

## データベースの場所

- **Electron**: `~/Library/Application Support/Illusions/illusions-storage.db`（macOS）
  または `%APPDATA%\Illusions\illusions-storage.db`（Windows）
- **Web**: ブラウザ IndexedDB（開発者ツールで確認）

## トラブルシューティング

### Electron で "Electron storage API not available" が出る

確認項目：
1. `electron/preload.ts` が正しく更新されている
2. preload が正しく読み込まれている（`electron/main.ts` の `webPreferences.preload` を参照）
3. IPC ハンドラーがメインプロセスに登録されている

### Web で IndexedDB が初期化できない

- ブラウザで IndexedDB が許可されているか
- ブラウザのコンソールにエラーが出ていないか
- シークレットモードでは制限される場合がある

## API リファレンス

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
  name: string;           // ファイル名
  path: string;          // ファイルパスまたは Handle
  lastModified: number;  // タイムスタンプ（ms）
  snippet?: string;      // 内容のプレビュー
}
```

### 主なメソッド

- `initialize()` - ストレージサービスを初期化
- `saveSession(session)` - ワークスペース全体を保存
- `loadSession()` - ワークスペース全体を読み込み
- `saveAppState(appState)` - アプリ状態を保存
- `loadAppState()` - アプリ状態を読み込み
- `addToRecent(file)` - 最近使用に追加（最大 10 件）
- `getRecentFiles()` - 最近使用の取得
- `removeFromRecent(path)` - 最近使用から削除
- `clearRecent()` - 最近使用をクリア
- `saveEditorBuffer(buffer)` - エディタバッファを保存
- `loadEditorBuffer()` - エディタバッファを読み込み
- `clearEditorBuffer()` - エディタバッファをクリア
- `clearAll()` - すべてのデータをクリア

## パフォーマンス考慮

- **Electron**: `better-sqlite3` は同期 API で高速かつ予測可能
- **Web**: IndexedDB は非同期で、API は Promise を返す
- 最近使用の一覧は最大 10 件に制限して性能を維持
- エディタバッファは定期的な保存（推奨 30 秒）が有効
