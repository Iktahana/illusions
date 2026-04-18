---
title: MDI ロードマップ
slug: mdi-roadmap
type: spec
status: draft
updated: 2026-04-18
tags:
  - mdi
  - roadmap
---

# MDI ロードマップ

このページは、MDI の未確定要素と今後整理したい論点を管理するための場所です。

## すでに実装済みの核

- ruby: `{親文字|ルビ}`
- 縦中横: `^...^`
- no-break: `[[no-break:...]]`
- kern: `[[kern:<量>:<文字列>]]`
- explicit line break: `[[br]]`（Issue #1235）
- `.mdi` ファイル拡張子
- HTML / TXT / PDF / EPUB / DOCX への出力経路

## 次に整理すべき論点

- editor 上の parser と export 側 parser の仕様差をなくす
- escape の扱いを仕様と実装で揃える
- invalid syntax の取り扱いを明文化する
- round-trip 保存時に HTML 混入をどう排除するかを仕様として固定する

## 将来拡張の候補

- block-level 構文の導入可否
- 章・原稿メタデータの記法
- strict / relaxed などの profile 定義
- バージョニングと互換方針
