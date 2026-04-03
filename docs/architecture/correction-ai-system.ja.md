---
title: 校正・AI校正システム
slug: correction-ai-system
type: architecture
status: active
updated: 2026-04-03
tags:
  - architecture
  - ai
  - linting
---

# 校正・AI校正システム

この文書は、現在の `illusions` に存在する校正パイプラインを、実装ベースで整理したものです。  
以前の文書にあった `LlmController`、`LintIssueValidator`、`LlmClient`、`prompts/lint-validation/` などは、現行 linting 経路の中心実装としては確認できませんでした。この版では、repo 内で追える構成だけを記します。

## 概要

現在の校正システムは、次の 3 層で組み上がっています。

1. 設定と rule orchestration
2. NLP / 形態素解析
3. Milkdown 上の decoration 表示

中心にいるのは [`lib/linting/rule-runner.ts`](../../lib/linting/rule-runner.ts) の `RuleRunner` です。

## 現在の実行フロー

### 1. `useLinting()` が `RuleRunner` を構築

[`lib/editor-page/use-linting.ts`](../../lib/editor-page/use-linting.ts) は次を行います。

- `RuleRunner` を 1 回生成
- `getAllRules()` と `createJsonDrivenRules()` でルールを登録
- `RULE_GUIDELINE_MAP` を読み込み guideline filtering を設定
- UI 設定に合わせて各ルールの config を同期

### 2. guideline / mode 変更を plugin に伝える

`useLinting()` は correction guideline が変わると `RuleRunner.setActiveGuidelines()` を呼び、さらに Milkdown linting plugin に `updateLintingSettings()` を送って再評価させます。

### 3. Milkdown linting plugin が表示を更新

[`packages/milkdown-plugin-japanese-novel/linting-plugin`](../../packages/milkdown-plugin-japanese-novel/linting-plugin/) の decoration plugin が:

- visible paragraph を収集
- 必要なら NLP を呼ぶ
- `RuleRunner` を使って issue を計算
- decoration として editor に描画

を行います。

## ルールの種類

型定義と基底クラスは `lib/linting/types.ts` と [`lib/linting/base-rule.ts`](../../lib/linting/base-rule.ts) にあります。

現行実装で確認できる基底クラス:

- `AbstractLintRule`
- `AbstractDocumentLintRule`
- `AbstractMorphologicalLintRule`
- `AbstractMorphologicalDocumentLintRule`
- `AbstractL1Rule`

この構成から分かる実際の分類は次のとおりです。

| 系統           | 実装の意味                           |
| -------------- | ------------------------------------ |
| L1             | regex / 文字列ベース中心             |
| L2             | kuromoji token を使う形態素ベース    |
| document-level | 段落単位でなく文書全体をまたいで判定 |

`L3` や `LLM-assisted` という型上の概念は残っていますが、現行 linting パスの中心として独立した runtime controller は確認できていません。

## NLP / 形態素解析

現在の形態素解析は `Sudachi/Kuromoji` 併用ではなく、**repo 上で確認できる実装は kuromoji 系** です。

主な入口:

- [`lib/nlp-client/nlp-client.ts`](../../lib/nlp-client/nlp-client.ts)
- [`lib/nlp-backend/nlp-processor.ts`](../../lib/nlp-backend/nlp-processor.ts)
- [`electron/ipc/nlp-ipc.js`](../../electron/ipc/nlp-ipc.js)

関連事実:

- linting plugin は `INlpClient` を受け取る
- `RuleRunner.hasMorphologicalRules()` が true のときだけ NLP を使う
- NLP 初期化や tokenization に失敗した場合、`useLinting()` は通知を出して L2 を事実上無効化する

## guideline filtering

現在の校正設定は [`lib/linting/correction-config.ts`](../../lib/linting/correction-config.ts) を中心に持っています。

重要な要素:

- `CorrectionModeId`
  - `novel`
  - `official`
  - `blog`
  - `academic`
  - `sns`
- `GuidelineId`
  - `jis-x-4051`
  - `novel-manuscript`
  - `joyo-kanji-2010`
  - ほか

`RuleRunner` は rule id と guideline id の対応表を受け取り、active guideline に入っていない rule を実行しません。

## Milkdown linting plugin の現況

[`linting-plugin/decoration-plugin.ts`](../../packages/milkdown-plugin-japanese-novel/linting-plugin/decoration-plugin.ts) で確認できる現在の特徴:

- viewport-aware な段落処理
- issue cache と token cache
- document-level issue cache
- `changeReason` に応じた smart invalidation
- ignored corrections のフィルタ
- NLP failure を 1 回だけ通知する保護

つまり現行システムは、単純な「毎回全文再解析」ではなく、**viewport と cache を前提にした editor-side linting** です。

## AI / LLM について現時点で言えること

現行コードベースで確認できるのは次の範囲です。

- `AppState` に `llmEnabled` / `llmModelId` / `llmIdlingStop` がある
- `CorrectionConfig` に `llm.validationEnabled` / `modelId` がある
- lint rule の型には `L3` / `LLM-assisted` の概念がある

ただし、旧文書にあったような:

- `LlmController`
- `LintIssueValidator`
- `LlmClient`
- `prompts/lint-validation/`

を中核にした現行ランタイムは、この repo の linting 主経路では確認できませんでした。  
そのため、現段階では「設定面と将来拡張の余地はあるが、文書化できる事実の中心は RuleRunner + kuromoji + decoration plugin である」と捉えるのが安全です。

## 拡張するときの入口

新しい rule を追加する場合は、まず `lib/linting/` を見るべきです。

基本的な入口:

1. `base-rule.ts`
2. `types.ts`
3. `rule-runner.ts`
4. `rule-registry.ts`
5. `lint-presets.ts`

editor への反映まで含めて追う場合は:

1. `lib/editor-page/use-linting.ts`
2. `packages/milkdown-plugin-japanese-novel/linting-plugin/*`

## 関連

- [lint ルール](../guides/linting-rules.md)
- [Milkdown プラグイン開発](../guides/milkdown-plugin.md)
