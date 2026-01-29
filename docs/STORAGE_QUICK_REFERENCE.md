# Storage Service クイックリファレンス

## クイックスタート

### 1. 基本

```typescript
import { getStorageService } from "@/lib/storage-service";

const storage = getStorageService();

// 初期化（初回呼び出し時に自動実行されます）
await storage.initialize();
```

### 2. セッションの保存 / 読み込み

```typescript
// セッション全体を保存
await storage.saveSession({
  appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
  recentFiles: [],
  editorBuffer: { content: "...", timestamp: Date.now() },
});

// セッションを読み込み
const session = await storage.loadSession();
```

### 3. 最近使用ファイル

```typescript
// 追加（最大 10 件に自動制限）
await storage.addToRecent({
  name: "Document.mdi",
  path: "/path/to/Document.mdi",
  lastModified: Date.now(),
  snippet: "Content preview...",
});

// 取得
const recent = await storage.getRecentFiles();

// 削除
await storage.removeFromRecent("/path/to/file.mdi");

// クリア
await storage.clearRecent();
```

### 4. エディタバッファ（自動保存 / 復旧）

```typescript
// 保存
await storage.saveEditorBuffer({
  content: editorContent,
  timestamp: Date.now(),
});

// 復旧
const buffer = await storage.loadEditorBuffer();
if (buffer) {
  console.log("Recovered content:", buffer.content);
}

// クリア
await storage.clearEditorBuffer();
```

### 5. アプリ状態

```typescript
// 保存
await storage.saveAppState({
  lastOpenedMdiPath: "/path/to/file.mdi",
});

// 読み込み
const appState = await storage.loadAppState();
```

### 6. 全削除

```typescript
await storage.clearAll(); // ⚠️ 元に戻せません
```

## API 早見表

```typescript
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

## 型定義

```typescript
interface RecentFile {
  name: string;           // ファイル名
  path: string;          // ファイルパス
  lastModified: number;  // タイムスタンプ（ms）
  snippet?: string;      // 内容プレビュー
}

interface AppState {
  lastOpenedMdiPath?: string;
}

interface EditorBuffer {
  content: string;      // 編集内容
  timestamp: number;    // タイムスタンプ
}

interface StorageSession {
  appState: AppState;
  recentFiles: RecentFile[];
  editorBuffer: EditorBuffer | null;
}
```

## よくあるパターン

### パターン 1: 起動時の復元

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

### パターン 2: 定期的な自動保存

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

### パターン 3: 保存時に最近使用を更新

```typescript
async function saveFile(path: string, content: string) {
  const storage = getStorageService();

  // ... ファイルシステムへ保存 ...

  await storage.addToRecent({
    name: path.split("/").pop() || "Untitled",
    path,
    lastModified: Date.now(),
    snippet: content.substring(0, 100),
  });

  await storage.clearEditorBuffer();
}
```

## 環境ごとの違い

### Electron
- ✅ 同期操作 / SQLite は高速
- ✅ 容量制限なし（ディスク依存）
- ❌ メインプロセス IPC が必要

### Web（IndexedDB）
- ✅ 互換性 / バックエンド不要
- ❌ 非同期 API / クォータ制限（目安 ~50MB）
- ❌ プライベートブラウジングでは利用不可の場合あり

## デバッグ

### Electron の DB を見る

```bash
~/Library/Application\ Support/Illusions/illusions-storage.db
sqlite3 ~/Library/Application\ Support/Illusions/illusions-storage.db
.schema
SELECT * FROM app_state;
SELECT * FROM recent_files;
SELECT * FROM editor_buffer;
```

### Web の IndexedDB を見る

1. 開発者ツール（F12）
2. Application タブ
3. IndexedDB
4. "IllusionsStorage" を選択

## FAQ

**Q: Web と Electron でデータ共有できますか？**
A: 直接共有はできません。Web は IndexedDB、Electron は SQLite を使います。

**Q: 機密データは暗号化できますか？**
A: 保存前に暗号化し、読み込み後に復号する処理を実装してください。

## クイック統合チェックリスト

- [ ] `better-sqlite3` をインストール（Electron）
- [ ] `electron/main.ts` に IPC ハンドラーを追加
- [ ] `electron/preload.ts` で storage API を公開
- [ ] 起動時に `loadSession()` を呼ぶ
- [ ] Electron / Web 両方で動作確認
