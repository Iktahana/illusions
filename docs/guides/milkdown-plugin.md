---
title: Milkdown プラグイン開発
slug: milkdown-plugin
type: guide
status: active
updated: 2026-04-03
tags:
  - guide
  - milkdown
  - mdi
---

# Milkdown プラグイン開発

このページは、`packages/milkdown-plugin-japanese-novel` の **現在の実装** を追うためのガイドです。  
以前の文書には、存在しない fixer や簡略化しすぎた構成説明が含まれていました。ここでは現行コードにあるものだけを記します。

## パッケージの役割

[`packages/milkdown-plugin-japanese-novel`](../../packages/milkdown-plugin-japanese-novel/) は、Milkdown / ProseMirror に日本語小説向けの編集機能を足すパッケージです。

主な責務は次の 3 系統です。

- MDI 由来の inline 構文を remark で解釈する
- カスタム node / schema を ProseMirror に追加する
- ProseMirror plugin で editor DOM や編集補助を整える

補助機能として、同じ package 配下に次の 2 つがあります。

- `pos-highlight/`
- `linting-plugin/`

## エントリーポイント

メインのエントリーポイントは [`index.ts`](../../packages/milkdown-plugin-japanese-novel/index.ts) の `japaneseNovel()` です。

```ts
import { japaneseNovel } from "@/packages/milkdown-plugin-japanese-novel";

Editor.make()
  .use(japaneseNovel({ isVertical: true }))
  .create();
```

`japaneseNovel()` は `MilkdownPlugin[]` を返します。  
オプション型は [`config.ts`](../../packages/milkdown-plugin-japanese-novel/config.ts) の `JapaneseNovelOptions` です。

現行オプション:

| Option               | Default | 説明                         |
| -------------------- | ------- | ---------------------------- |
| `isVertical`         | `false` | 縦書き class を付与する      |
| `showManuscriptLine` | `false` | 原稿用紙風 class を付与する  |
| `enableRuby`         | `true`  | ルビ構文を有効化する         |
| `enableTcy`          | `true`  | 縦中横構文を有効化する       |
| `enableNoBreak`      | `true`  | 改行禁止 span を有効化する   |
| `enableKern`         | `true`  | カーニング span を有効化する |

## 構文とノード

現行のカスタム schema / node は次のとおりです。

| ノード           | ファイル                  | 役割                   |
| ---------------- | ------------------------- | ---------------------- |
| `ruby`           | `nodes/ruby.ts`           | `{親文字\|ルビ}`       |
| `tcy`            | `nodes/tcy.ts`            | `^12^` のような縦中横  |
| `nobreak`        | `nodes/nobreak.ts`        | `[[no-break:...]]`     |
| `kern`           | `nodes/kern.ts`           | `[[kern:0.2em:...]]`   |
| `heading-anchor` | `nodes/heading-anchor.ts` | 見出しアンカー用ノード |

### 構文パーサ

remark 側の構文プラグインは [`syntax.ts`](../../packages/milkdown-plugin-japanese-novel/syntax.ts) にあります。

- `remarkRubyPlugin`
- `remarkTcyPlugin`
- `remarkNoBreakPlugin`
- `remarkKernPlugin`
- `remarkHeadingAnchorPlugin`

以前の文書で触れていた `paragraph-id-fixer` は、現在の package 構成には存在しません。

## ProseMirror プラグイン

`japaneseNovel()` が常に組み込む ProseMirror plugin は次の 3 つです。

| プラグイン              | ファイル                      | 役割                                            |
| ----------------------- | ----------------------------- | ----------------------------------------------- |
| `stylePlugin`           | `index.ts` 内                 | `.milkdown-japanese-vertical` などの class 付与 |
| `headingIdFixerPlugin`  | `plugins/heading-id-fixer.ts` | 見出し ID を安定化                              |
| `hardbreakIndentPlugin` | `plugins/hardbreak-indent.ts` | hard break 周りの字下げ補助                     |

ここでも、旧文書にあった `paragraph-id-fixer` は現行実装にはありません。

## `MilkdownEditor.tsx` との接続

アプリ本体側の接続は [`components/editor/MilkdownEditor.tsx`](../../components/editor/MilkdownEditor.tsx) です。

現在このコンポーネントでは:

- `japaneseNovel({ isVertical, showManuscriptLine: false, enableRuby, enableTcy })`
- `posHighlight(...)`
- `linting(...)`

を editor 作成時に組み込み、`editorViewInstance` に対して一部設定を動的更新します。

実装上の特徴:

- `enableRuby` と `enableTcy` は UI 設定に合わせて切り替える
- `posHighlight` と `linting` は editor を再作成せずに設定更新する
- editor の縦横レイアウトや measure box は `MilkdownEditor.tsx` 側で制御しており、`japaneseNovel()` 本体は scroll viewport を持ちません

## 品詞ハイライト

品詞ハイライトは [`pos-highlight/`](../../packages/milkdown-plugin-japanese-novel/pos-highlight/) にあります。

現行実装の事実:

- `getNlpClient()` を使って NLP バックエンドに接続する
- ProseMirror decoration plugin として動作する
- paragraph 単位で結果をキャッシュする
- 設定更新は `updatePosHighlightSettings()` で editor 再作成なしに行う

## linting プラグイン

linting は [`linting-plugin/`](../../packages/milkdown-plugin-japanese-novel/linting-plugin/) にあります。

現行実装の事実:

- `RuleRunner` を受け取ってルールを実行する
- 必要なときだけ `INlpClient` を使って形態素解析する
- ProseMirror decorations で issue を表示する
- viewport-aware な段落処理と cache を持つ
- document-level rule があれば全文脈の処理も走る
- `updateLintingSettings()` で change reason 付きの動的更新ができる
- `onNlpError` コールバックで NLP トークナイズ失敗を通知する（失敗エピソードにつき 1 回のみ呼ばれる）

## 開発時の見方

機能を追うときは次の順で見ると早いです。

1. `components/editor/MilkdownEditor.tsx`
2. `packages/milkdown-plugin-japanese-novel/index.ts`
3. `packages/milkdown-plugin-japanese-novel/syntax.ts`
4. `packages/milkdown-plugin-japanese-novel/nodes/*`
5. `packages/milkdown-plugin-japanese-novel/pos-highlight/*`
6. `packages/milkdown-plugin-japanese-novel/linting-plugin/*`

## 関連

- [MDI 構文仕様](../MDI/spec.md)
- [MDI 実装ノート](../MDI/implementation.md)
- [lint ルール](./linting-rules.md)
