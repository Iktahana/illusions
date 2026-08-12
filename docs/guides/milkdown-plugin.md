---
title: Milkdown エディター統合
slug: milkdown-plugin
type: guide
status: active
updated: 2026-08-13
---

# Milkdown エディター統合

Illusions のエディターは、文書構文、表示レイアウト、アプリ機能を別々の owner に分ける。

## 現在の最小コア

| 責務                                              | Owner                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| MDI editor parse / schema / canonical serialize   | `@illusions-lab/milkdown-plugin-mdi`                              |
| MDI diagnostics / text projection                 | `@illusions-lab/mdi`                                              |
| Markdown                                          | `src/lib/document-format` の Markdown adapter（CommonMark + GFM） |
| plain text                                        | `src/lib/document-format` の plain-text adapter                   |
| writing mode / line length / vertical wheel       | `@illusions-lab/milkdown-plugin-vertical-writing@1.0.1`           |
| history / clipboard / change notification / flush | `src/components/editor/MilkdownEditor.tsx`                        |
| font / line-height / paragraph spacing            | `src/app/editor-typography.css`                                   |

`src/components/Editor.tsx` は writing-mode preference と provider を接続する薄い shell、
`MilkdownEditor.tsx` は上記 package を compose する最小 lifecycle である。MDI delimiter や
vertical scroll の規則をアプリ側で実装してはいけない。

## Document adapter

`.mdi`、`.md`、`.txt` は `DocumentFormat` と `DocumentAdapter` で明示的に分離する。

| 拡張子 | Adapter    | MDI semantics | Markdown semantics                |
| ------ | ---------- | ------------- | --------------------------------- |
| `.mdi` | MDI        | 有効          | CommonMark / GFM を基礎として有効 |
| `.md`  | Markdown   | 無効          | 有効                              |
| `.txt` | plain text | 無効          | 無効                              |

editor core は拡張子や delimiter を判定せず、選択済み adapter のみを参照する。`.md` / `.txt`
の text projection と diagnostics に MDI parser を流してはいけない。Save As で拡張子が変わると
editor key と adapter が同時に切り替わり、保存済み source 自体は暗黙変換しない。

## MDI runtime

Browser 版 WASM は editor より先に初期化する必要がある。`app/layout.tsx` の
`MdiRuntimeProvider` が唯一の renderer bootstrap であり、失敗した promise は cache せず再試行可能に
する。project-search worker は別 realm なので worker 内で独立して初期化する。

## Writing mode

公開 CSS は `src/app/globals.css` から一度だけ import する。初期化後の変更は action で行い、
Milkdown instance を再構築しない。

```ts
editor.action(changeWritingMode("vertical-rl"));
editor.action(changeLineLength(40));
editor.action(changeLineLength(null));
```

`.milkdown-vertical-writing`、`data-writing-mode`、`data-line-length`、reading-axis wheel と scroll
position は package が所有する。アプリ CSS や event listener で同じ責務を再実装しない。

## 意図的に切り離している機能

2026-08-13 の再構築では旧 editor feature implementation を削除し、UI shell を残した。次の機能は
「移設済み」ではなく、新コア用 extension として一つずつ再接続する対象である。

- lint decoration と editor 内 correction action
- POS highlight
- search / speech highlight と auto-scroll
- selection tracking と選択範囲統計
- bubble menu、context menu、toolbar
- 旧 novel-specific paragraph / heading behavior

設定、Inspector、Dialog 等の UI が存在することは editor extension が接続済みである証拠ではない。
再接続するときは MDI 文法や writing-mode を feature 側へ複製せず、core boundary gate を更新する。

## Upstream MDI plugin の範囲

`milkdown-plugin-mdi@0.1.0` は front matter と inline MDI（ruby、TCY、boten、no-break、warichu、
kern、explicit break、nesting）を提供する。block syntax、commands、input rules、popover、paste、
custom clipboard serializer は未提供である。不足構文を Illusions に Regex / Remark / ProseMirror
fallback として実装せず、公開 upstream release を待って dependency を更新する。

## Release gate

`npm run check:boundaries` は通常の import boundary に加えて次を検査する。

- 旧 editor package / implementation が復活していない
- editor core が延期中 feature を import していない
- renderer が private `@illusions-lab/mdi-core` を直接 import していない
- MDI plugin と vertical-writing plugin が相互依存していない
- MDI / Milkdown runtime が複数 version に分裂していない
- vertical-writing の公式 CSS が読み込まれている

統合監査の結果と機能 matrix は
[MDI 2.0 エディター統合監査](../architecture/mdi-2-editor-audit.md) を参照する。
