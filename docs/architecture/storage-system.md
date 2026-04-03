---
title: ストレージシステム
slug: storage-system
type: architecture
status: active
updated: 2026-04-03
tags:
  - architecture
  - storage
---

# ストレージシステム

この文書は、現在の `illusions` が使っているストレージ抽象層の実装に合わせて整理したものです。  
古い文書にあった簡略化された API 例や旧型定義ではなく、現行の `lib/storage/*` を基準にしています。

## 全体像

ストレージの入口は [`lib/storage/storage-service.ts`](../../lib/storage/storage-service.ts) の `getStorageService()` です。

```ts
import { getStorageService } from "@/lib/storage/storage-service";

const storage = getStorageService();
await storage.initialize();
```

この factory は実行環境を見て provider を切り替えます。

- Web
  - [`lib/storage/web-storage.ts`](../../lib/storage/web-storage.ts)
  - IndexedDB / Dexie
- Electron
  - [`lib/storage/electron-storage.ts`](../../lib/storage/electron-storage.ts)
  - preload bridge + IPC
  - main process 側は [`electron/ipc/storage-ipc.js`](../../electron/ipc/storage-ipc.js)
  - 実ストアは [`lib/storage/electron-storage-manager.ts`](../../lib/storage/electron-storage-manager.ts)

## 共通インターフェース

現在の共通型は [`lib/storage/storage-types.ts`](../../lib/storage/storage-types.ts) の `IStorageService` です。

主な責務:

- セッション保存 / 復元
- `AppState` 保存 / 復元
- 最近使ったファイル
- editor buffer
- recent projects
- 汎用 key-value store

### 主要メソッド

| メソッド                                                            | 用途                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `initialize()`                                                      | provider 初期化                                              |
| `saveSession()` / `loadSession()`                                   | `appState` / `recentFiles` / `editorBuffer` を一括保存・復元 |
| `saveAppState()` / `loadAppState()`                                 | UI 設定・プロジェクト状態などの永続化                        |
| `addToRecent()` / `getRecentFiles()`                                | 最近使ったファイル                                           |
| `saveEditorBuffer()` / `loadEditorBuffer()` / `clearEditorBuffer()` | 未保存下書き                                                 |
| `addRecentProject()` / `getRecentProjects()`                        | 最近使ったプロジェクト                                       |
| `setItem()` / `getItem()` / `removeItem()`                          | 汎用 KV ストア                                               |
| `clearAll()`                                                        | 全削除                                                       |

## `AppState` に入るもの

`AppState` はかなり広く使われています。現行型には少なくとも次が含まれます。

- editor 表示設定
  - `fontScale`
  - `lineHeight`
  - `paragraphSpacing`
  - `textIndent`
  - `fontFamily`
  - `charsPerLine`
  - `autoCharsPerLine`
  - `showParagraphNumbers`
- 品詞ハイライト設定
- linting / correction mode / guideline 設定
- LLM 関連設定
- TTS 設定
- terminal 設定
- open tabs / dockview layout
- keymap overrides
- project / character data

つまり、これは単なる「最近開いたファイル」保存ではなく、エディタ全体の持続設定の集約先です。

## Web 実装

Web は [`web-storage.ts`](../../lib/storage/web-storage.ts) の `WebStorageProvider` が担当します。

現行実装の事実:

- Dexie DB 名は `illusionsStorage`
- `appState` / `recentFiles` / `editorBuffer` / `projectHandles` / `kvStore` を持つ
- `saveSession()` は Dexie transaction で一括保存する
- `saveEditorBuffer(buffer, fileKey?)` は `fileKey` を使える
- `projectHandles` は `ProjectManager` と連携して Web のディレクトリハンドル永続化を支える

補足:

- Web での recent project / project handle 管理は、`IStorageService` 単体では完結せず、`lib/project/*` と分担しています
- `FileSystemFileHandle` / `FileSystemDirectoryHandle` を使うため、ブラウザ依存の制約があります

## Electron 実装

Electron は [`electron-storage.ts`](../../lib/storage/electron-storage.ts) の `ElectronStorageProvider` が担当します。

現行実装の事実:

- レンダラ側 provider 自体は薄い IPC ラッパ
- preload から `window.electronAPI.storage` を介して main process に渡す
- 実 DB 操作は `ElectronStorageManager`
- SQLite 実装に `better-sqlite3` を使う

注意点:

- Electron 版の `saveEditorBuffer(buffer, fileKey?)` は interface 上は `fileKey` を受けるが、現状 provider 側では無視する
- つまり `fileKey` による editor buffer 分離は、現時点では Web 実装のほうが実質的に強い

## recent files と recent projects

このストレージ層には 2 系統の最近使った項目があります。

### recent files

- `RecentFile`
- 単一ファイルを開く流れで使う
- `path` ベース

### recent projects

- `RecentProject`
- project root 単位で扱う
- Electron では SQLite に永続化
- Web では project handle と組み合わせた別管理が入る

## editor buffer

`EditorBuffer` はクラッシュ復旧や保存前ドラフト維持のためのデータです。

現行型:

```ts
interface EditorBuffer {
  content: string;
  timestamp: number;
  fileHandle?: FileSystemFileHandle;
}
```

補足:

- Web では `fileHandle` を保持できる
- Electron では IPC を通すが、`fileHandle` 前提の流れは Web ほど強くない

## 実装上の境界

この層は「保存 API の共通化」を担いますが、次の責務は外にあります。

- project lifecycle 全体
- directory handle の復元フロー
- tab manager のビジネスロジック
- dockview のレイアウト復元ロジック

つまり storage service は、状態を保存する基盤であって、アプリ全体の復元オーケストレーションそのものではありません。

## 関連

- [project lifecycle](./project-lifecycle.md)
- [tab manager](./tab-manager.md)
- [VFS](./vfs.md)
