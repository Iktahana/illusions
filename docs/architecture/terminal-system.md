---
title: ターミナルサブシステム
slug: terminal-system
type: architecture
status: active
updated: 2026-04-06
tags:
  - architecture
  - electron
  - terminal
  - pty
---

# ターミナルサブシステム

illusions は、Electron 環境において統合ターミナル機能を提供します。このシステムは、フロントエンドの xterm.js とバックエンドの `node-pty` を IPC で接続することで実現されています。

## 設計の目的

- **開発ワークフローの統合**: エディタを離れることなく、Git 操作やビルドコマンドを実行できるようにする。
- **マルチセッション対応**: 複数のターミナルタブを同時に開き、それぞれ独立したシェルセッションを維持する。
- **プラットフォーム最適化**: Windows (PowerShell/cmd.exe) および macOS/Linux (bash/zsh) の各環境で最適なシェルを自動選択する。

## システム構成

### 主要コンポーネント

- **`TerminalPanel` (Renderer)**: `xterm.js` を使用してターミナル UI を描画するコンポーネントです。
- **`useTerminalTabs` (Renderer)**: ターミナルタブの生成、セッション ID の管理、IPC 通信のハンドリングを行うフックです。
- **`pty-ipc.js` (Main)**: レンダラープロセスからの要求を受け取り、`node-pty` プロセスを制御する IPC ハンドラ群です。
- **`terminal-session-registry.js` (Main)**: 起動中の PTY セッションを管理し、ウィンドウごとのセッション数制限などを制御します。

### データフロー

1. **セッション開始**: ユーザーがアクティビティバーやコンテキストメニューから新規ターミナルをリクエストすると、レンダラーが `pty:spawn` を呼び出し、メインプロセスで `node-pty` がシェルプロセスを起動してユニークな `sessionId` を返します。
2. **出力の転送 (Main → Renderer)**: PTY プロセスからの出力データは、`pty:data` イベントとしてレンダラーに送られ、xterm.js インスタンスに書き込まれます。
3. **入力の転送 (Renderer → Main)**: ユーザーのキー入力は、xterm.js の `onData` イベントから `pty:write` IPC を通じて PTY プロセスに送られます。
4. **リサイズ**: パネルのリサイズが発生すると、`pty:resize` IPC が送られ、バックエンドの PTY プロセスの列数・行数が更新されます。

## セッション管理

- **所有権**: 各 PTY セッションは、それを生成した `webContents` (ウィンドウ) に紐付けられます。他ウィンドウからの不正なアクセスは IPC レイヤで拒否されます。
- **バッファリング**: メインプロセス側で一定量の出力バッファを保持しており、タブの切り替えなどで再描画が必要な際に即座に内容を復元できます。
- **自動クリーンアップ**: ウィンドウが閉じられた際や、シェルプロセスが終了した際には、関連するセッション情報とプロセスが自動的に破棄されます。

## 制限事項

- **Electron 専用**: 本機能は `node-pty` に依存しているため、Web 版 (ブラウザ) では利用できません。
- **セッション制限**: システムリソース保護のため、ウィンドウあたり最大数、およびグローバルでの最大セッション数が設定されています。

## 関連ファイル

- `lib/editor-page/use-terminal-tabs.ts`: レンダラー側ロジック
- `components/ActivityBar.tsx`: 起動用ボタン
- `components/TerminalPanel.tsx`: ターミナル UI
- `electron/ipc/pty-ipc.js`: メインプロセス IPC ハンドラ
- `electron/ipc/terminal-session-registry.js`: セッション管理レジストリ
