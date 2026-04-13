---
title: エディタ初期化ライフサイクル
slug: editor-lifecycle
type: architecture
status: active
updated: 2026-04-06
tags:
  - architecture
  - lifecycle
  - initialization
---

# エディタ初期化ライフサイクル

illusions のエディタ（メインウィンドウ）が起動し、ユーザーが編集可能になるまでの初期化フローと、終了時の保存処理について説明します。

## 初期化フロー (Initialization)

エディタの初期化は、複数のフェーズを経て段階的に行われます。

### 1. 環境検知とストレージ準備

`app/layout.tsx` および `app/page.tsx` のマウント時に開始されます。

- 実行環境（Electron / Web）を特定し、適切な `StorageService` プロバイダーを初期化します。
- ユーザーのテーマ設定、表示設定（フォント、マージン等）をロードします。

### 2. セッションの復元 (Auto-Restore)

`useProjectLifecycle` 内の `useAutoRestore` フックが担当します。

- **URL パラメータのチェック**: `?welcome` が指定されている場合は自動復元をスキップし、ウェルカム画面を表示します。
- **直近の状態のロード**: ストレージから最後に開いていたプロジェクトの ID、開いていたタブのリスト、および Dockview のレイアウトをロードします。
- **権限の確認 (Web)**: プロジェクトディレクトリへのアクセス権限が失効している場合は、`PermissionPrompt` を表示してユーザーに再承認を求めます。

### 3. 外部からの起動ハンドリング (Pending Files)

Electron 環境で、ファイルやディレクトリをアプリにドラッグ＆ドロップしたり、関連付けられたファイルをダブルクリックして起動した場合の処理です。

- `window.electronAPI.getPendingFile()` を呼び出し、起動引数として渡されたファイルパスを取得します。
- 取得したファイルは新規タブとして開かれるか、プロジェクトとしてマウントされます。

### 4. VFS およびプロジェクトの初期化

`useProjectInitialization` が担当します。

- 選択されたプロジェクト、またはスタンドアロンファイルのディレクトリを `Virtual File System (VFS)` のルートとしてマウントします。
- プロジェクトのメタデータ（`project.json`）を読み込み、エディタの状態を同期します。

### 5. コンテンツのロードとレンダリング

- 最後にアクティブだったタブのバッファ（`BufferState`）をロードし、Milkdown エディタに流し込みます。
- 統計情報（文字数、読了時間）、校正（Linting）の実行、履歴（History）のインデックス作成を並行して開始します。

## 終了処理 (Termination)

データ損失を防ぐため、ウィンドウが閉じられる直前に以下の処理が実行されます。

### beforeunload イベント

`useEditorLifecycle` フックで登録されたリスナーが、以下のデータをストレージへ強制書き込み（Flush）します。

- **Tab State**: 現在開いているタブのリストと、それぞれの編集状態（BufferId, FilePath 等）。
- **Layout State**: Dockview の分割状態、パネルのサイズと位置。
- **Unsaved Content**: 未保存のバッファ内容を `editor_buffer` テーブルに一時保存します（次回の自動復旧用）。

## 関連フック

- `app/page.tsx`: メインエントリポイント
- `lib/editor-page/use-project-lifecycle.ts`: プロジェクト全体の制御
- `lib/editor-page/use-auto-restore.ts`: セッション復旧ロジック
- `lib/editor-page/use-project-initialization.ts`: VFS / プロジェクト初期化
- `lib/editor-page/use-editor-lifecycle.ts`: beforeunload ハンドリング
