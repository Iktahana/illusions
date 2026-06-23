---
title: 辞書と校正の無視設定
slug: dictionary-and-ignored-corrections
type: architecture
status: active
updated: 2026-06-23
tags:
  - architecture
  - dictionary
  - linting
  - settings
---

# 辞書と校正の無視設定

illusions では、校正（Linting）機能の指摘を管理するために、ダウンロード可能な辞書データと、特定の箇所の指摘を恒久的に無視する機能を提供しています。

## 設計の目的

- **誤検知の削減**: 意図的な表現や固有名詞に対して不要な指摘を表示しないようにする。
- **柔軟な管理**: 単純な単語ベースの無視だけでなく、特定の文脈における指摘のみを無視できるようにする。
- **プロジェクト単位の設定管理**: プロジェクトモードでは、無視設定をプロジェクトディレクトリ内の `.illusions/` フォルダに保存します。

## システム構成

### 主要コンポーネント

- **`IgnoredCorrectionsService`**: 指摘の無視フラグを管理します。
- **`useIgnoredCorrections`**: エディタ（Milkdown）と連携し、無視リストに基づいて指摘をフィルタリングします。
- **`IssueCard` コンポーネント**: 校正パネル（インスペクター）の UI で、個別の指摘に対して「無視」や「一括無視」の操作を提供します。
- **`UserDictionaryService`**: ユーザーが登録した語（辞書外語の除外語）をモード別スコープで永続化します。
- **`useKnownTerms` / `known-terms`**: ユーザー辞書および辞書系ルールセットの登録語を「既知語」集合として収集し、辞書外語ルールの抑制対象を供給します。

## 保存場所の切り分け

| モード                   | 保存先                                | ファイル形式     |
| :----------------------- | :------------------------------------ | :--------------- |
| **プロジェクトモード**   | `.illusions/ignored-corrections.json` | JSON 形式        |
| **スタンドアロンモード** | OS のローカルストレージ               | キーバリュー形式 |

## 校正の無視 (Ignored Corrections) の仕組み

illusions は、以下の 2 つのレベルで無視機能を実装しています。

### 1. コンテキストベースの無視

指摘された箇所の周囲のテキスト（コンテキスト）から生成されたハッシュ値を用いて、特定の箇所の指摘のみを無視します。

- **判定ロジック**: 指摘された単語の前後のコンテキストを厳密なハッシュ値（Exact Hash）として比較します。
- **特徴**: 文中の同一単語でも、特定の箇所のみを無視し、他の箇所では指摘を表示し続けることができます。

### 2. 全域無視 (Global Ignore)

特定のファイル内で、内容が同一の指摘をすべて一括で無視します。

- **操作**: 「無視」アイコンを右クリックすることでトリガーされます。
- **判定ロジック**: コンテキストハッシュを使用せず、指摘メッセージやルールIDに基づいて同一の指摘をすべて非表示にします。

## ユーザー辞書と既知語による抑制

辞書外語（辞書に無い語）としてマークされた語は、ユーザーが「この語をユーザー辞書に追加」操作で登録でき、登録後はマークの対象から除外されます。

- **入口**: 校正パネルの指摘カードのボタン、およびエディタ波線のコンテキストメニュー（`add-to-user-dict`）。書き込みはホスト（`useUserDictionaryActions`）が担い、ルールセットはマニフェストの `suggestsDictionaryEntry` フラグで操作の表示意図のみを宣言します。
- **スコープ**: プロジェクトモードはプロジェクト単位（`.illusions/`）、スタンドアロンモードはファイル単位（ローカルストレージ）で保存します。
- **即時反映**: `useKnownTerms` が `UserDictionaryService` の変更を購読しており、語の追加・削除がエディタの波線へ即座に反映されます。
- **既知語の合成**: 抑制対象の「既知語」集合は、ユーザー辞書の登録語と、導入済み辞書系ルールセットが提供する登録語の和集合（`collectKnownTerms`）です。1 ソースの取得失敗は fail-safe で無視され、他ソースの語は維持されます。

### Genji 辞書のダウンロード仕組み

Electron 版では、辞書データ（Genji SQLite データベース）を以下のフローで管理します。

1. **バージョン確認**: `DictManager.checkUpdate()` が GitHub Releases API（`https://api.github.com/repos/illusions-lab/Genji/releases/latest`）を呼び出し、最新バージョンと `.db.gz` アセットの URL を取得します。
2. **ダウンロード**: `DictManager.download()` が `.db.gz` ファイルをダウンロードし、gzip 展開後にアトミックな `rename` で既存データベースを置き換えます。ダウンロードの多重実行防止にはミューテックスを使用します。
3. **Web フォールバック**: Electron IPC バックエンドが利用できない場合、`GenjiApiBackend` が `https://api.dict.illusions.app` の Datasette API に直接クエリを送ります。

## 関連ファイル

- `lib/services/ignored-corrections-service.ts`: 無視設定サービス
- `lib/editor-page/use-ignored-corrections.ts`: エディタとの連携ロジック
- `components/inspector/IssueCard.tsx`: 指摘無視・ユーザー辞書追加操作を提供する UI
- `lib/editor-page/use-lint-handlers.ts`: 校正結果のフィルタリング・辞書追加アクションの配線
- `lib/editor-page/use-user-dictionary-actions.ts`: 校正 UI からのユーザー辞書追加フック
- `lib/editor-page/use-known-terms.ts`: 既知語集合の収集・購読フック
- `lib/linting/known-terms.ts`: 既知語の合成（ユーザー辞書＋辞書系ルールセット登録語）
- `lib/services/user-dictionary-service.ts`: ユーザー辞書のモード別永続化と変更通知
- `electron/dict-manager.js`: Electron メインプロセスの辞書ダウンロード・管理
- `lib/dict/providers/genji-api-backend.ts`: Web 用 Datasette API クライアント
- `lib/dict/dict-types.ts`: プロバイダー共通の辞書型定義
