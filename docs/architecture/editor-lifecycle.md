---
title: エディタ初期化ライフサイクル
slug: editor-lifecycle
type: architecture
status: active
updated: 2026-08-13
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
- extension から `.mdi` / `.md` / `.txt` adapter を決め、MDI の場合は Rust WASM 初期化完了後に
  Milkdown を mount します。
- Milkdown の async create 中は writing mode、line length、外部内容置換を実行しません。作成済み
  EditorView と現在の format generation が一致してから action を適用します。
- format 切替では旧 EditorView を破棄し、新しい adapter で作成した view の ready 通知を待ちます。
- 検索、校正 decoration、品詞 highlight、音声追従、選択範囲統計等は現在 editor core へ未接続です。

### 6. 編集、外部置換、保存

- editor の変更通知は active adapter の canonical serializer で tab buffer を更新します。
- file watcher 等による外部内容置換は新 EditorView の ready 後に一度適用します。
- 保存直前は登録済み flush callback が IME composition を確定し、現在の EditorView を同期 serialize
  します。debounce 済みの tab buffer だけを信用しません。
- Save As は source bytes を暗黙変換せず、保存成功後に destination extension から次回 adapter を
  更新します。読取・保存・hot update の将来設計は、この現行データ安全契約とは別に議論します。

### 7. MDI block position ownership

- MDI の block 順序、kind、`block:grapheme` range、UTF-8 span / source map は
  `@illusions-lab/mdi#getMdiTextBlocks()` の Rust IR projection を唯一の基準とします。
- source revision が変わると座標も再取得します。旧 revision の block metadata を新しい EditorView へ
  適用しません。
- CSS counter、DOM 順序、ProseMirror traversal、source line number から機械編集用の block position を
  作りません。
- `@illusions-lab/milkdown-plugin-mdi@0.4.0` の provenance bridge で Rust source span を editable
  node range に対応付けます。区画位置 UI は `getMdiTextBlocks()` の index と span を batch mapping API に
  渡すだけとし、DOM traversal、文字列一致、CSS counter、独自 block ID を使用しません。

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
