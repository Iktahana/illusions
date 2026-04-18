---
title: MDI 実装ノート
slug: mdi-implementation
type: spec
status: active
updated: 2026-04-18
tags:
  - mdi
  - implementation
---

# MDI 実装ノート

このページは、MDI が倉庫内のどこで扱われているかを追うための実装インデックスです。

## Editor / UI

- `components/editor/MilkdownEditor.tsx`
  MDI 拡張の有効化、縦横レイアウト、Milkdown への組み込み。
- `components/RubyDialog.tsx`
  ruby 記法の組み立て UI。
- `components/EditorContextMenu.tsx`
  ruby / tcy などの MDI 機能を編集 UI に露出。
- `packages/milkdown-plugin-japanese-novel/`
  MDI 記法に対応する ProseMirror node / remark plugin / decoration 群。

### Explicit Line Break (`[[br]]`)

- `packages/milkdown-plugin-japanese-novel/syntax.ts`
  `MDI_BREAK_RE`、`remarkMdiBreakPlugin` — text node を走査し `[[br]]` を mdibreak インライン node に変換。
- `packages/milkdown-plugin-japanese-novel/nodes/mdibreak.ts`
  `mdibreakSchema` — ProseMirror の atom inline node、`<br class="mdi-break">` を出力。
- `packages/milkdown-plugin-japanese-novel/plugins/hardbreak-indent.ts`
  CommonMark の hardbreak と MDI の mdibreak の両方にインデント用スペーサー装飾を適用。

## Parsing / Export

- `lib/export/mdi-parser.ts`
  inline 構文の共通パーサ。`[[br]]` を改行（`\n`）として strip する処理を含む。
- `lib/export/mdi-to-html.ts`
  MDI を安全な HTML に変換する中核。`[[br]]` → `<br class="mdi-break">`。`getMdiStylesheet()` に `br.mdi-break` ルールを含む。
- `lib/export/txt-exporter.ts`
  MDI 構文を plain text / ruby 付きテキストに変換。`[[br]]` は `\n` として出力される。
- `lib/export/pdf-exporter.ts`
- `lib/export/epub-exporter.ts`
  EPUB は `mdi-to-html.ts` を経由するため、`[[br]]` の処理は自動的に共有される。
- `lib/export/docx-exporter.ts`
  `parseInlineFormatting` で `[[br]]` を境界としてテキストを分割し、`TextRun({ break: 1 })` として出力。

## File / Project Integration

- `lib/project/mdi-file.ts`
  `.mdi` ファイルの open/save。
- `lib/project/project-types.ts`
  MDI ファイルの既定設定。
- `electron/ipc/file-ipc.js`
  Electron 側の `.mdi` ファイルダイアログ。
- `package.json`
  MDI ドキュメント種別の登録情報。

## Tests

- `lib/export/__tests__/mdi-parser.test.ts`
  regex / parser の基礎検証。
- `lib/project/__tests__/mdi-file.test.ts`
  `.mdi` ファイルハンドリングのテスト。

## 現時点の整理方針

- 構文仕様の source of truth は `docs/MDI/spec.md`
- 実装差分や設計の意図はこのページに追記する
- 未確定の仕様候補は `roadmap.md` に分離し、確定仕様へ混ぜない
