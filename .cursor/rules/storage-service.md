# Storage Service Rule

## 概要

本プロジェクトには、Web/Electron 共通で使えるデータ永続化の抽象層（StorageService）があります。
保存処理を各所で独自実装せず、必ずこの統一サービスを利用してください。

## コア位置

```
lib/
├── storage-types.ts              # 中核インターフェース定義
├── storage-service.ts            # ファクトリ関数（getStorageService）
├── web-storage.ts                # Web 実装（IndexedDB）
├── electron-storage.ts           # Electron 実装（IPC）
├── electron-storage-manager.ts   # Electron メインプロセス側
├── storage-service-examples.ts   # 使用例
└── storage-service-tests.ts      # テストスイート
```

関連ドキュメント:
- `docs/STORAGE_INDEX.md` - 早見ナビ（推奨）
- `docs/STORAGE_INTEGRATION.md` - 組み込み手順
- `docs/STORAGE_ARCHITECTURE.md` - アーキテクチャ
- `docs/STORAGE_QUICK_REFERENCE.md` - API 早見表
- `docs/ELECTRON_INTEGRATION_CHECKLIST.md` - Electron 組み込みチェック

## すぐ使う

### 基本

```ts
import { getStorageService } from "@/lib/storage-service";

const storage = getStorageService();

// セッションを保存
await storage.saveSession({
  appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
  recentFiles: [],
  editorBuffer: { content: "...", timestamp: Date.now() },
});

// セッションを読み込み
const session = await storage.loadSession();
```

### 最近使ったファイル

```ts
await storage.addToRecent({
  name: "Document.mdi",
  path: "/path/to/Document.mdi",
  lastModified: Date.now(),
  snippet: "Content preview",
});

const recent = await storage.getRecentFiles();
```

### 自動保存（下書きバッファ）

```ts
useEffect(() => {
  const interval = setInterval(async () => {
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now(),
    });
  }, 30000); // 30秒ごと

  return () => clearInterval(interval);
}, [editorContent]);
```

## API（12メソッド）

| メソッド | 用途 |
|---|---|
| `initialize()` | 初期化 |
| `saveSession()` | セッション一括保存 |
| `loadSession()` | セッション一括読込 |
| `saveAppState()` | アプリ状態の保存 |
| `loadAppState()` | アプリ状態の読込 |
| `addToRecent()` | 最近使ったファイルへ追加 |
| `getRecentFiles()` | 最近使ったファイル一覧 |
| `removeFromRecent()` | 最近使ったファイルから削除 |
| `clearRecent()` | 最近使ったファイルを全削除 |
| `saveEditorBuffer()` | 下書きバッファ保存 |
| `loadEditorBuffer()` | 下書きバッファ読込 |
| `clearEditorBuffer()` | 下書きバッファ削除 |

## データ構造

### StorageSession

```ts
{
  appState: { lastOpenedMdiPath?: string },
  recentFiles: RecentFile[],  // 最大 10 件
  editorBuffer: EditorBuffer | null,
}
```

### RecentFile

```ts
{
  name: string;          // ファイル名
  path: string;          // ファイルパス
  lastModified: number;  // タイムスタンプ
  snippet?: string;      // 内容プレビュー
}
```

### EditorBuffer

```ts
{
  content: string;       // 下書き本文
  timestamp: number;     // タイムスタンプ
}
```

## 環境差分

### Electron
- 方式: SQLite（`better-sqlite3`）
- 位置: `~/Library/Application Support/Illusions/illusions-storage.db`
- 実行: メインプロセスで同期処理
- 通信: IPC（ipcRenderer.invoke / ipcMain.handle）

### Web
- 方式: IndexedDB（Dexie）
- 実行: 非同期（Promise）
- 目安: ~50MB
- 位置: ブラウザストレージ

## よくあるパターン

### パターン1: 起動時の復元

```ts
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

  void restore();
}, []);
```

### パターン2: 保存時に状態更新

```ts
async function saveFile(path: string, content: string) {
  const storage = getStorageService();

  // ファイルシステムへ保存
  // ...

  // 最近使ったファイルを更新
  await storage.addToRecent({
    name: path.split("/").pop()!,
    path,
    lastModified: Date.now(),
    snippet: content.substring(0, 100),
  });

  // アプリ状態を更新
  await storage.saveAppState({ lastOpenedMdiPath: path });

  // 下書きバッファを削除
  await storage.clearEditorBuffer();
}
```

## やってはいけないこと

- 独自の保存ロジックを各所で実装しない
- Electron で localStorage を永続化の主軸にしない
- IndexedDB を直接触らない
- SQLite を直接管理しない

## 代わりにやること

- 常に `getStorageService()` を使う
- 統一APIで読み書きする
- 環境判定はサービスに任せる
- 下書きバッファは定期的に保存する

## Electron 組み込みチェック

Electron で利用する場合の確認:

- [ ] `better-sqlite3` をインストール: `npm install better-sqlite3`
- [ ] メイン側の IPC ハンドラを更新
- [ ] preload で storage API を公開
- [ ] `types/electron.d.ts` を更新
- [ ] アプリ層から `getStorageService()` を呼べる

参照: `docs/ELECTRON_INTEGRATION_CHECKLIST.md`

## 設計原則

1. 同一API: Electron と Web で同じコードが動く
2. 自動判定: 手動設定を最小化
3. 型安全: TypeScript 前提
4. 性能: Electron は同期、Web は非同期
5. 使いやすさ: 単純で直感的
6. 信頼性: 例外/失敗を握りつぶさない
7. 拡張性: 機能追加がしやすい

## FAQ

**Q: initialize() はいつ呼べばいい？**
A: 実装方針により異なりますが、原則は利用前に 1 回です（多くの場合は初回利用時に内部で呼び出します）。

**Q: 下書きバッファは暗号化されている？**
A: 前提はローカル利用です。必要ならアプリ側で暗号化を追加してください。

**Q: 複数インスタンスで競合する？**
A: Electron は WAL を利用して競合を抑えます。Web は IndexedDB のロック特性に依存します。

**Q: 最近使ったファイルの上限を変えたい**
A: 該当実装内の定数を調整してください。

## バージョン情報

- バージョン: 1.0.0
- 状態: Production Ready
- 最終更新: 2026-01-28
- 依存: `better-sqlite3`（Electron）, `dexie@^4.2.1`（Web）
