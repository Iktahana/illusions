# Storage Service Implementation - 実装ドキュメント

## 📋 概要

この実装は、`StorageService` として **Electron / Web の両方で同一 API による永続化**を提供します。実行環境を自動検出し、適切なストレージ実装（Electron: SQLite / Web: IndexedDB）を選択します。

### 主な特長

- ✅ **環境自動判定**: Electron / Web を自動検出
- ✅ **統一 API**: フロントエンドは同じ呼び出しで利用可能
- ✅ **型安全**: TypeScript で型定義を提供
- ✅ **3 層ストレージ**: App State / Recent Files / Editor Buffer
- ✅ **上限管理**: 最近使用は最大 10 件
- ✅ **復旧**: editor buffer による未保存復旧

---

## 🗂️ ファイル構成

```
lib/
├── storage-types.ts              # コア型/インターフェース
├── storage-service.ts            # ファクトリ関数 + シングルトン
├── web-storage.ts                # Web 実装（IndexedDB via Dexie）
├── electron-storage.ts           # Electron 実装（IPC クライアント）
├── electron-storage-manager.ts   # Electron メイン側（SQLite）
├── storage-service-examples.ts   # 使用例
└── storage-service-tests.ts      # テスト（開発用）

types/
└── electron.d.ts                 # Electron API 型定義

docs/
├── STORAGE_INTEGRATION.md        # 統合ガイド（最重要）
├── STORAGE_ARCHITECTURE.md       # アーキテクチャ
├── STORAGE_QUICK_REFERENCE.md    # クイックリファレンス
└── STORAGE_INDEX.md              # ドキュメント索引
```

---

## 🚀 クイックスタート

### 手順 1: 依存関係（Electron のみ）

```bash
npm install better-sqlite3
```

※ Web 側は `dexie` を利用します（既に導入済み）。

### 手順 2: Electron へ統合

詳細は `docs/STORAGE_INTEGRATION.md` を参照してください。要点は以下です。

- `electron/main.ts` で `ElectronStorageManager` を作成し IPC handler を登録
- `electron/preload.ts` で `electronAPI.storage` を公開

### 手順 3: アプリ側で利用

```typescript
import { getStorageService } from "@/lib/storage-service";

const storage = getStorageService();

await storage.saveSession({
  appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
  recentFiles: [],
  editorBuffer: { content: "...", timestamp: Date.now() },
});

const session = await storage.loadSession();
```

---

## 📚 コア API（要点）

- `initialize()`
- `saveSession()` / `loadSession()`
- `saveAppState()` / `loadAppState()`
- `addToRecent()` / `getRecentFiles()` / `removeFromRecent()` / `clearRecent()`
- `saveEditorBuffer()` / `loadEditorBuffer()` / `clearEditorBuffer()`
- `clearAll()`

型の詳細は `lib/storage-types.ts` を参照してください。

---

## 💾 保存場所

- Electron: `app.getPath('userData')` 配下（例: macOS は `~/Library/Application Support/Illusions/illusions-storage.db`）
- Web: ブラウザ IndexedDB

---

## 🧪 テスト / 検証

- Electron: sqlite3 で DB を確認

```bash
sqlite3 ~/Library/Application\ Support/Illusions/illusions-storage.db
.schema
SELECT * FROM app_state;
SELECT * FROM recent_files;
SELECT * FROM editor_buffer;
```

- Web: 開発者ツール → Application → IndexedDB → `IllusionsStorage`

---

## 🐛 トラブルシューティング（要点）

### Electron で "Electron storage API not available"

- preload が読み込まれているか（`webPreferences.preload`）
- `electron/main.ts` に IPC handler が登録されているか
- `electron/preload.ts` で `electronAPI.storage` を公開しているか

### Web で IndexedDB が動かない

- ブラウザで IndexedDB が許可されているか
- プライベートブラウジング（シークレット）で制限されていないか
- クォータ制限に達していないか
