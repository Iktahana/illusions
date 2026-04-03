---
title: キーボードショートカット
slug: keyboard-shortcuts
type: guide
status: active
updated: 2026-04-03
tags:
  - guide
  - shortcuts
---

# キーボードショートカット

このページは、現在の `illusions` がどの経路でショートカットを処理しているかを、実装に合わせて整理したものです。  
以前のような「すべて `useGlobalShortcuts` が処理する」という説明は現状と一致しません。

## 現在の責務分担

### 1. 単一のソースオブトゥルース

デフォルトのショートカット定義は [`lib/keymap/shortcut-registry.ts`](../../lib/keymap/shortcut-registry.ts) にあります。  
コマンド ID の一覧は [`lib/keymap/command-ids.ts`](../../lib/keymap/command-ids.ts) が source of truth です。

### 2. Web のグローバル処理

[`lib/hooks/use-global-shortcuts.ts`](../../lib/hooks/use-global-shortcuts.ts) は、現在は **`Cmd/Ctrl + R` をブロックするだけ** です。  
保存、検索、ズーム、ファイル操作などをここで配布しているわけではありません。

### 3. 通常のショートカット配布

[`lib/editor-page/use-keyboard-shortcuts.ts`](../../lib/editor-page/use-keyboard-shortcuts.ts) が `useKeymapListener()` を使ってコマンドを配布します。

- editor 専用コマンド
  - `format.ruby`
  - `format.tcy`
  - `nav.search`
  - `edit.pasteAsPlaintext`
- タブ操作
  - `nav.nextTab`
  - `nav.prevTab`
  - `nav.tab1` から `nav.tab9`
- Web でだけメニュー action に橋渡しするコマンド
  - `file.open`
  - `file.saveAs`
  - `file.newWindow`
  - `view.zoomIn`
  - `view.zoomOut`
  - `view.resetZoom`

### 4. Web メニューとの対応

Web メニューの見た目と action 文字列は [`lib/menu/menu-definitions.ts`](../../lib/menu/menu-definitions.ts) にあります。  
実行側は [`lib/menu/use-web-menu-handlers.ts`](../../lib/menu/use-web-menu-handlers.ts) で、`open-file` や `paste-plaintext` などの action を処理します。

重要なのは、**command id と menu action は別物** という点です。

- command id の例: `file.saveAs`
- menu action の例: `save-as`

## デフォルトショートカット一覧

以下は `shortcut-registry.ts` にある現行の既定値です。

| コマンド ID                | 既定キー                       | 説明                     |
| -------------------------- | ------------------------------ | ------------------------ |
| `file.save`                | `Cmd/Ctrl+S`                   | 保存                     |
| `file.saveAs`              | `Shift+Cmd/Ctrl+S`             | 別名で保存               |
| `file.open`                | `Cmd/Ctrl+O`                   | ファイルを開く           |
| `file.newWindow`           | `Cmd/Ctrl+N`                   | 新規ウィンドウ           |
| `file.newTab`              | `Cmd/Ctrl+T`                   | 新規タブ                 |
| `file.closeTab`            | `Cmd/Ctrl+W`                   | タブを閉じる             |
| `edit.undo`                | `Cmd/Ctrl+Z`                   | 元に戻す                 |
| `edit.redo`                | `Cmd/Ctrl+Y`                   | やり直す                 |
| `edit.pasteAsPlaintext`    | `Shift+Cmd/Ctrl+V`             | プレーンテキスト貼り付け |
| `edit.selectAll`           | `Cmd/Ctrl+A`                   | すべて選択               |
| `view.zoomIn`              | `Cmd/Ctrl++`                   | 拡大                     |
| `view.zoomOut`             | `Cmd/Ctrl+-`                   | 縮小                     |
| `view.resetZoom`           | `Cmd/Ctrl+0`                   | ズームリセット           |
| `view.compactMode`         | `Shift+Cmd/Ctrl+M`             | コンパクトモード切替     |
| `view.splitRight`          | `Cmd/Ctrl+\\`                  | 右に分割                 |
| `view.splitDown`           | `Shift+Cmd/Ctrl+\\`            | 下に分割                 |
| `nav.nextTab`              | `Ctrl+Tab`                     | 次のタブ                 |
| `nav.prevTab`              | `Ctrl+Shift+Tab`               | 前のタブ                 |
| `nav.tab1` から `nav.tab9` | `Cmd/Ctrl+1` から `Cmd/Ctrl+9` | 番号付きタブへ移動       |
| `nav.settings`             | `Cmd/Ctrl+,`                   | 設定を開く               |
| `nav.search`               | `Cmd/Ctrl+F`                   | 検索を開く               |
| `panel.explorer`           | `Ctrl+Shift+E`                 | エクスプローラー切替     |
| `panel.search`             | `Ctrl+Shift+F`                 | 検索パネル切替           |
| `format.ruby`              | `Shift+Cmd/Ctrl+R`             | ルビダイアログ           |
| `format.tcy`               | `Shift+Cmd/Ctrl+T`             | 縦中横切替               |

## Web と Electron の違い

### Web

- `useGlobalShortcuts()` は reload 防止のみ
- 実際のショートカット配布は keymap registry + `useKeyboardShortcuts()`
- メニュー action は `useWebMenuHandlers()` が処理

### Electron

- 同じ command id / keymap registry を前提に UI を組んでいる
- レンダラ側では Web 専用の menu action bridge を使わないコマンドがある
- ストレージされたキーマップ override は `KeymapContext` から Electron メニュー更新にも同期される

## カスタマイズ

キーマップの既定値は [`contexts/KeymapContext.tsx`](../../contexts/KeymapContext.tsx) で `SHORTCUT_REGISTRY` から組み立てられ、ユーザー override とマージされます。

- 既定値: `shortcut-registry.ts`
- override 永続化: `lib/keymap/keymap-storage.ts`
- 実行時マッチング: `lib/keymap/use-keymap-listener.ts`

新しいショートカットを追加する場合は、少なくとも次の 3 箇所を揃えてください。

1. `command-ids.ts` に command id を追加する
2. `shortcut-registry.ts` に既定 binding と label を追加する
3. 実行側で handler を接続する

## 注意点

- `Cmd/Ctrl+1` から `9` は現在の実装では Electron 専用ではありません
- `useGlobalShortcuts()` はショートカットの中央配布層ではありません
- menu のラベル、menu action、command id は 1 対 1 の同名ではありません

## 関連

- [Milkdown プラグイン開発](./milkdown-plugin.md)
- [lint ルール](./linting-rules.md)
