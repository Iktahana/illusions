---
title: サンプル・ルールセット（テンプレート）
status: draft
updated: 2026-06-19
---

# サンプル・ルールセット（写経用テンプレート）

新しいルールセット開発の出発点。最小2ルール（L1 regex 1つ ＋ 辞典依存 1つ）を含む。
**製品としては同梱しない**（別リポジトリの起点）。コードは [authoring.md](./authoring.md)
の契約に従う。

## `manifest.json`

```json
{
  "id": "com.example.sample",
  "name": "Sample Ruleset",
  "nameJa": "サンプル・ルールセット",
  "version": "1.0.0",
  "engineApi": 1,
  "license": "MIT",
  "guidelines": [
    {
      "id": "sample",
      "nameJa": "サンプル規約",
      "publisherJa": "—",
      "year": null,
      "license": "Public",
      "descriptionJa": "SDK の使い方デモ"
    }
  ],
  "rules": [
    {
      "ruleId": "sample-fw-exclaim",
      "nameJa": "全角『！』の検出",
      "descriptionJa": "和文中の全角感嘆符を半角に直します。",
      "guidelineId": "sample",
      "level": "L1",
      "defaultConfig": { "enabled": true, "severity": "info" },
      "docs": {
        "positiveExample": "すごい!",
        "negativeExample": "すごい！",
        "sourceReference": "サンプル規約 §1"
      }
    },
    {
      "ruleId": "sample-dict-unknown",
      "nameJa": "辞書にない語の検出",
      "descriptionJa": "幻辞辞典に存在しない見出し語を警告します（辞典が必要）。",
      "guidelineId": "sample",
      "level": "L2",
      "defaultConfig": { "enabled": true, "severity": "info" },
      "requires": [{ "kind": "dict", "dictId": "genji" }],
      "docs": {
        "positiveExample": "猫が鳴く。",
        "negativeExample": "ﾈｺが鳴く。",
        "sourceReference": "サンプル規約 §2"
      }
    }
  ]
}
```

## `index.ts`（ビルドして `index.js` を生成）

```ts
// 型のみ import 可。基底/道具は ctx 経由で受け取る（値 import 禁止）。
import type { RulesetModule, RulesetContext, LintRuleConfig } from "@/lib/linting/sdk";
import manifestJson from "./manifest.json";

const manifest = manifestJson as RulesetModule["manifest"];

const ruleset: RulesetModule = {
  manifest,
  createRules(ctx: RulesetContext) {
    const { AbstractL1Rule } = ctx.bases;
    const { toolkit } = ctx;

    // --- L1: 全角！→半角！ ---
    const exMeta = manifest.rules[0];
    class FwExclaimRule extends AbstractL1Rule {
      lint(text: string, config: LintRuleConfig) {
        if (!config.enabled) return [];
        return toolkit.regexReplace({
          text,
          pattern: /！/,
          ruleId: this.id,
          severity: config.severity,
          message: "Use half-width '!'",
          messageJa: "全角『！』は半角『!』にしてください。",
          replacement: () => "!",
        });
      }
    }

    const exclaim = new FwExclaimRule(toolkit.toJsonRuleMeta(exMeta, manifest), {
      id: exMeta.ruleId,
      name: exMeta.nameJa,
      nameJa: exMeta.nameJa,
      description: exMeta.descriptionJa,
      descriptionJa: exMeta.descriptionJa,
      defaultConfig: exMeta.defaultConfig,
    });

    // 辞典依存ルール(sample-dict-unknown)は registry が
    // 辞典未DL時に自動 disable + 警告するため、ここでは安全に実装すればよい。
    // （L2 トークン連携の実装例は移行フェーズで追記）

    return [exclaim];
  },
};

export default ruleset;
```

## `docs/sample-fw-exclaim.md`（校正目録の例）

```markdown
# sample-fw-exclaim — 全角『！』の検出

- 意図: 和文の本文では半角感嘆符に統一する。
- 出典: サンプル規約 §1
- 正例: すごい!
- 誤例: すごい！ → すごい!
```

## `test/sample.test.ts`（ゴールデン）

```ts
import { describe, it, expect } from "vitest";
import ruleset from "../index";
import { makeTestContext } from "./helpers"; // bases + toolkit を渡すヘルパ

describe("sample-fw-exclaim", () => {
  const rule = ruleset.createRules(makeTestContext()).find((r) => r.id === "sample-fw-exclaim")!;
  const cfg = { enabled: true, severity: "warning" } as const;

  it("positive example yields no issue", () => {
    expect(rule.lint("すごい!", cfg)).toHaveLength(0);
  });
  it("negative example is flagged", () => {
    expect(rule.lint("すごい！", cfg).length).toBeGreaterThan(0);
  });
});
```

## 関連

- 作成ガイド: [authoring.md](./authoring.md)
- リポジトリ構造: [structure.md](./structure.md)
