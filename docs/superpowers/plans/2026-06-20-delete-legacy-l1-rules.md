# Plan: 内蔵 me2 / nh L1 ルールのデッドコード削除

## Goal

PR #1802 で内蔵 `manuscript`(me2-_) / `nihongo-hyouki`(nh-_) パックを公開ルールセット
(genkou-henshu / nihongo-hyouki) へ移行し終えた結果、以下の 2 ファイルは
`createJsonDrivenRules`（`lib/linting/rule-registry.ts`）から既に外され、**production からは到達不能**になっている。残っているのはテストの直 import とバレル re-export のみ。同じ PR #1802 内でこのデッドコードを物理削除し、ツリーをクリーンにする。

- `lib/linting/rules/json-l1/manuscript-l1-rules.ts`（dead）
- `lib/linting/rules/json-l1/nihongo-hyouki-l1-rules.ts`（dead）

## Architecture / 現状の依存グラフ（grep で確証済み）

```
manuscript-l1-rules.ts (createManuscriptL1Rules)
  ← lib/linting/rules/json-l1/index.ts        (re-export)
  ← lib/linting/__tests__/l1-rules-false-positives.test.ts  (me2-13 テストのみ)
  ※ production 参照ゼロ（rule-registry は jtf のみ import）

nihongo-hyouki-l1-rules.ts (createNihongoHyoukiL1Rules)
  ← lib/linting/rules/json-l1/index.ts        (re-export)
  ← lib/linting/__tests__/l1-rules-false-positives.test.ts  (nh-10 / nh-11 テストのみ)
  ※ production 参照ゼロ

lib/linting/rules/json-l1/index.ts (バレル)
  → 消費者ゼロ。createJtfL1Rules すら全員が "./jtf-l1-rules" から直接 import
    (rule-registry.ts:6 / rule-runner.test.ts:6 / l1-rules-false-positives.test.ts:13)
  → 完全なデッドバレル
```

**保持するもの（jtf 依存）**:

- `lib/linting/rules/json-l1/jtf-l1-rules.ts` — JTF は公開版が無く内蔵維持。`rule-registry.ts` が直接依存。
- `lib/linting/data/rules.json` / `lib/linting/rule-loader.ts` — jtf が利用（`jtf-l1-rules.ts:13` が `../../rule-loader` を、`rule-loader.ts:8` が `./data/rules.json` を import）。本計画では触らない。
- `l1-rules-false-positives.test.ts` の `jtf-2-2-1-kanji word boundary` describe ブロック

**移行先の挙動等価テストの所在（Codex R2）**: me2-_ / nh-_ の挙動カバレッジは移行先の外部 repo
（`illusions-ruleset-genkou-henshu` / `illusions-ruleset-nihongo-hyouki`、v0.3.0）側のテストに存在する。
本 repo にはルールセット登録（`electron/official-rulesets.js`）のみで実装は無いため、ローカル
`vitest` はクリーンアップの安全性のみを証明する（移行等価性は外部 repo の CI で担保）。デッド実装に
対するテストは復活させない。

※ `lib/linting/data/rules.json` には `rule_ME2_13_unit_symbols` / `nihongo_hyouki_10` /
`nihongo_hyouki_11` という **別の raw ID** が残るが、これは jtf も使う共有 loader データであり、
削除対象の runtime ID（`me2-13-unit-symbols` 等）とは別物。触らない。

## Tasks

### Task 1 — デッドソース 2 ファイルを削除

- `git rm lib/linting/rules/json-l1/manuscript-l1-rules.ts`
- `git rm lib/linting/rules/json-l1/nihongo-hyouki-l1-rules.ts`

### Task 2 — デッドバレル `index.ts` を削除

- `git rm lib/linting/rules/json-l1/index.ts`
- 根拠: バレルの 3 つの export のうち 2 つは Task 1 で消える対象、残る `createJtfL1Rules`
  もバレル経由の消費者がゼロ（全員 `jtf-l1-rules` を直接 import）。単一 export の未使用
  バレルを残すより削除が DRY。

### Task 3 — `l1-rules-false-positives.test.ts` からデッドテストを除去

対象: `lib/linting/__tests__/l1-rules-false-positives.test.ts`（現 193 行）

- import 削除（line 11-12）:
  - `import { createManuscriptL1Rules } from "../rules/json-l1/manuscript-l1-rules";`
  - `import { createNihongoHyoukiL1Rules } from "../rules/json-l1/nihongo-hyouki-l1-rules";`
- describe ブロック削除（区切りコメント込み）:
  - `me2-13-unit-symbols`（コメント line 23 起点〜block 末 line 51）
  - `nh-10-units`（line 53〜91）
  - `nh-11-symbols dash detection`（line 93〜134）
- **保持**: `import { createJtfL1Rules } from "../rules/json-l1/jtf-l1-rules";`（line 13）と
  `jtf-2-2-1-kanji word boundary` describe（line 136〜末尾）。ヘルパー `findRule` / `CFG` も保持。

### Task 4 — 検証

```bash
npx tsc --noEmit
npx eslint lib/linting/rules/json-l1 lib/linting/__tests__/l1-rules-false-positives.test.ts
npx vitest run lib/linting
```

期待: tsc/eslint エラーなし。vitest は `l1-rules-false-positives` が jtf ブロックのみで green、
他の lib/linting スイートも全 green（移行時に 1851 件 green を確認済み。本削除で消えるのは
me2-13/nh-10/nh-11 の 3 describe のみ）。

### Task 5 — コミット

```
chore(linting): 公開ルールセットへ移行済みの内蔵 me2/nh L1 ルールを削除

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

- ブランチ `feature/lint-l2-ruleset-migration`（PR #1802 を自動更新）
- push 後 CI green を確認。

## リスク / 注意

- **Codex 凍結パス**（`lib/linting/**`）に触れる。本作業は PR #1802 と同一スコープで、完了後
  基準コミット＋変更ファイル一覧を Codex へ共有済みの運用を継続。
- `jtf-l1-rules.ts` / `lib/linting/data/rules.json` / `lib/linting/rule-loader.ts` は JTF が live 依存のため**削除しない**。
- バレル削除（Task 2）は単一 export の未使用ファイル除去であり挙動非変更。万一バレル経由の
  動的 import が後から増える前提があれば Task 2 のみスキップ可（jtf 単独 export に縮小）。
