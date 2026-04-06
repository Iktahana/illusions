---
title: Dockview レイアウトシステム
slug: dockview-layout
type: architecture
status: active
updated: 2026-04-06
tags:
  - architecture
  - ui
  - layout
  - dockview
---

# Dockview レイアウトシステム

illusions では、分割エディタや柔軟なパネル配置を実現するために [dockview-react](https://dockview.dev/) を採用しています。このドキュメントでは、dockview が illusions のタブ管理システムとどのように連携し、レイアウトを永続化しているかを説明します。

## 設計の目的

- **分割エディタのサポート**: 画面を上下左右に分割し、複数のファイル（または同一ファイルの異なる箇所）を同時に表示する。
- **多様なパネル種別**: エディタ（NovelEditor）、ターミナル、差分比較（Diff）を同一のレイアウト管理下に置く。
- **レイアウトの永続化**: ウィンドウを閉じたりプロジェクトを切り替えたりしても、パネルの配置やサイズを復元する。

## システム構成

### 主要コンポーネント

- **`useDockviewAdapter`**: `useTabManager` と dockview API の間を仲介し、パネルの追加・削除・同期を管理します。
- **`useDockviewPersistence`**: レイアウトの変更を検知し、StorageService を介して保存します。
- **`dockviewComponents`**: dockview パネル内で描画される実際の React コンポーネント群を定義します。

## レイアウトの永続化と復元

illusions では、dockview 標準の `toJSON()` によるシリアライズデータを保存していますが、復元時には ID に依存しない **簡略化レイアウト (`SimplifiedGroupLayout`)** を主に使用しています。

### 1. 物理レイアウトの保存 (`dockviewJson`)

dockview 本体のシリアライズデータです。現在の実装では主に情報の保持（`toJSON()`）のために保存されていますが、復元プロセスでは直接使用されません。

### 2. 簡略化レイアウトによる復元 (`SimplifiedGroupLayout`)

タブの ID が再生成されても正しく配置を復元するため、ファイルパスやセッション ID などの安定したキーに基づいた構造を記述します。

- **復元の仕組み**: `useDockviewAdapter` は起動時に保存された `simplifiedLayout` を読み込み、各パネルを `moveTo` メソッドで正しいグループと位置に再配置し、リサイズを実行します。
- **対象**: エディタ（ファイルパス）、ターミナル（セッションID）、差分比較（ソースタブID）。

## パネルパラメータ (`EditorPanelParams`)

dockview パネルには、表示内容を特定するためのパラメータが渡されます。

```typescript
export interface EditorPanelParams {
  bufferId: BufferId;
  filePath: string;
  fileType: string;
  editorKey: number;
  activeTabId: string;
}
```

重要: **バッファの内容自体はパラメータに含まれません**。各パネルは `tabsRef` を介して最新のコンテンツを参照することで、入力ごとの dockview 全体の再レンダリングを回避しています。

## 関連ファイル

- `lib/dockview/types.ts`: 型定義
- `lib/dockview/use-dockview-adapter.ts`: レイアウト復元ロジック (`applySimplifiedLayout`)
- `lib/dockview/use-dockview-persistence.ts`: シリアライズと保存ロジック
- `lib/dockview/dockview-components.tsx`: パネル UI コンポーネント
