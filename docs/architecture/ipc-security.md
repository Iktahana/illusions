---
title: Electron IPC セキュリティとパス検証
slug: ipc-security
type: architecture
status: active
updated: 2026-04-06
tags:
  - architecture
  - electron
  - security
  - ipc
---

# Electron IPC セキュリティとパス検証

illusions では、Electron のメインプロセスとレンダラープロセス間の通信（IPC）において、悪意のあるスクリプトや脆弱性を突いた不正なファイルアクセスを防ぐため、厳格なセキュリティモデルを採用しています。

## セキュリティ設計の原則

1. **最小権限の原則**: レンダラープロセスには、ファイルシステム全体への自由なアクセス権を与えません。
2. **信頼の境界**: レンダラーからのパス指定は常に「未信頼」として扱い、メインプロセス側で検証を行います。
3. **明示的な許可**: ユーザーがネイティブダイアログ（ファイル選択等）で明示的に選択したパスのみ、そのウィンドウでの操作を許可します。

## パス検証メカニズム

### 1. ダイアログ承認パスの追跡 (`dialogApprovedPaths`)

メインプロセスは、各ウィンドウ（`webContentsId`）ごとに、ユーザーがダイアログを通じて承認したパスのリストをメモリ上に保持します。

- **LRU キャッシュ**: メモリ肥大化を防ぐため、ウィンドウごとに最大 200 パスまでの LRU（Least Recently Used）形式で管理します。
- **ウィンドウ分離**: あるウィンドウで承認されたパスは、他のウィンドウからは再利用できません。これにより、ウィンドウ間のパス漏洩を防ぎます。
- **自動破棄**: ウィンドウが閉じられると、そのウィンドウに関連付けられた承認済みパスリストは即座に破棄されます。

### 2. 禁止パスリスト (Deny List)

システムにとって重要なディレクトリや、ユーザーのプライバシーに関わるパスへのアクセスは、たとえダイアログで選択されたとしても拒否されます。

- **システムディレクトリ**: `/etc`, `/usr`, `/bin`, `C:/Windows`, `C:/Program Files` など。
- **機密データ**: `.ssh`, `.gnupg`, `.aws`, `Library/Keychains` など。
- **正規化**: パスは常に正斜線（`/`）形式に正規化され、接頭辞（Prefix）一致によってネストされたディレクトリも一括してブロックされます。

## 通信の安全性

### コンテキスト分離 (Context Isolation)

レンダラープロセスは、Node.js の API に直接アクセスできません。

- **Preload Script**: `electron/preload.js` を介して、必要最小限の IPC 関数のみを `window.electronAPI` として公開します。
- **シリアライズ**: IPC を通じて送受信されるデータは、構造化複製アルゴリズムによってシリアライズされ、プロトタイプ汚染などの攻撃を防止します。

## 実装の入口

- **`electron/ipc/file-ipc.js`**: `approveDialogPath` によるパス承認と `isSavePathDenied` による検証。
- **`electron/ipc/vfs-ipc-handlers.js`**: 仮想ファイルシステム（VFS）におけるパスバリデーション。
- **`electron/preload.js`**: セキュアな API 露出の定義。

## 関連ファイル

- `electron/ipc/file-ipc.js`
- `electron/ipc/vfs-ipc-handlers.js`
- `electron/preload.js`
- `electron/main.js`
