---
title: 校正・AI校正システム
slug: correction-ai-system
type: architecture
status: active
updated: 2026-08-13
tags:
  - architecture
  - ai
  - linting
---

# 校正・AI校正システム

## 現在の状態

設定 UI、外部 ruleset、worker、`RuleRunner`、ignored correction、user dictionary の application
service は残っている。一方、2026-08-13 の editor core 再構築で旧 ProseMirror decoration plugin は削除した。
そのため校正結果を本文へ decoration として表示・更新する経路は現在未接続である。

UI が表示されることと editor integration が動作することを混同してはいけない。
`useLinting()` の manual refresh は、新 extension が実装されるまで安全な no-op としている。

## 保持している層

- `src/lib/linting/`: rule type、registry、toolkit、presets
- `src/lib/editor-page/linting-plugin/worker/`: ruleset worker protocol / proxy
- `src/lib/linting/external-ruleset-loader.ts`: 外部 ruleset lifecycle
- `src/lib/editor-page/use-linting.ts`: UI 設定と worker lifecycle
- `src/lib/editor-page/use-ignored-corrections.ts`: 無視設定
- `src/lib/editor-page/use-user-dictionary-actions.ts`: user dictionary action
- settings / Inspector / correction UI

## 削除した層

- editor decoration plugin
- viewport paragraph cache と editor transaction hook
- editor context menu からの correction action
- POS decoration

これらは旧 implementation を戻さず、新 editor core の公開 extension boundary を使って再実装する。

## 再接続時の規則

1. MDI source を Regex で解釈しない。分析対象は `DocumentAdapter.projectText()` または Rust-owned
   source map から得る。
2. `.md` / `.txt` に MDI semantics を適用しない。
3. writing-mode、wheel、line length を校正 extension が所有しない。
4. editor core へ worker / NLP / ruleset implementation を直接 import しない。
5. source revision と diagnostics / range の対応を明示し、古い range を新しい document に適用しない。

## 関連

- [Lint ルール](../guides/linting-rules.md)
- [Milkdown エディター統合](../guides/milkdown-plugin.md)
- [MDI 2.0 エディター統合監査](mdi-2-editor-audit.md)
