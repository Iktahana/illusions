---
title: キーマップシステム
slug: keymap-system
type: architecture
status: active
updated: 2026-04-06
tags:
  - architecture
  - keymap
  - keyboard
  - electron
---

# キーマップシステム

illusions では、主要なキーボードショートカットを `CommandId` ベースで管理しており、ユーザーが自由にキーバインドを上書き（オーバーライド）できる仕組みを提供しています。

## 設計の目的

- **柔軟なカスタマイズ**: 設定画面から特定のコマンドに対するキーバインドを変更できるようにする。
- **一元管理（進行中）**: ショートカット定義をレジストリにまとめ、アクセシビリティと整合性を保つ。
- **マルチプラットフォーム対応**: 多くのコマンドにおいて Windows (Ctrl) と macOS (Cmd) の差異を吸収し、適切なモディファイアを自動適用する。
- **Electron との同期**: ユーザーが設定したショートカットを、Electron のネイティブメニュー（Accelerator）にも反映させる。

## システム構成

### 主要コンポーネント

- **`SHORTCUT_REGISTRY`**: コマンド ID、デフォルトのキー、ラベル、カテゴリーを定義したレジストリです。
- **`KeymapProvider` (React Context)**: デフォルトの定義とユーザー設定をマージし、アプリケーション全体に提供します。
- **`useKeymapListener`**: キーボード入力をコマンド実行に変換するフックです。

### 制限事項

現在の実装では、すべてのショートカットが `SHORTCUT_REGISTRY` に集約されているわけではありません。

- **ハードコードされたショートカット**: 行間設定（line-height）など、一部のショートカットは `electron/menu.js` や `lib/menu/menu-definitions.ts` に直接記述されています。これらは現在のところユーザーによるオーバーライドの対象外です。
- **プラットフォーム固有の固定キー**: `CmdOrCtrl` 抽象化を使用せず、すべてのプラットフォームで `Ctrl` に固定されているバインド（例: ターミナル関連の一部）も存在します。

## キーバインドの解決フロー

1. **マージ**: `KeymapProvider` は初期化時に `SHORTCUT_REGISTRY` を読み込み、保存されていた `overrides` で上書きします。
2. **イベント検知**: `useKeymapListener` が `keydown` イベントを捕捉します。
3. **コマンド特定**: 入力されたキーの組み合わせと一致する `CommandId` を検索します。
4. **アクション実行**: 特定された `CommandId` に対応するハンドラが呼び出されます。

## Electron ネイティブメニューとの同期

illusions は Electron の `Menu.setApplicationMenu` を使用しています。

- ユーザーがショートカットを変更すると、`updateKeymapOverrides` IPC が呼び出されます。
- メインプロセス（`electron/menu.js`）は、オーバーライド設定を反映した新しい `Menu` インスタンスを生成し、アプリケーション全体に適用します。

## 関連ファイル

- `lib/keymap/command-ids.ts`: コマンド ID のリスト
- `lib/keymap/shortcut-registry.ts`: デフォルトのキーバインド定義
- `contexts/KeymapContext.tsx`: 状態管理と IPC 同期
- `electron/menu.js`: ネイティブメニューとハードコードされたアクセラレータ
