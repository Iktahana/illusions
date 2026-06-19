---
title: 校正ルールセット開発ドキュメント
status: draft
updated: 2026-06-19
---

# 校正ルールセット開発

illusions の校正(lint)ルールは **ルールセット**という単位で配布される。ルールセットは
`RulesetModule` を default export する**コードモジュール**で、`createRules(ctx)` が具体的な
`LintRule[]` を返す。**1リポジトリ = 1ルールセット**。

- 組み込みルールセット: illusions 本体に同梱（静的 import）。
- 外部ルールセット: `~/.illusions/rulesets/<id>/` に配置（Electron のみ。Web は組み込みのみで縮退）。

> このディレクトリが校正ルールセット開発の正本。旧 `docs/linting/` は廃止済み（本ディレクトリへ統合）。

## ドキュメント一覧

| ドキュメント                             | 内容                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| [authoring.md](./authoring.md)           | SDK 契約・`ctx.toolkit` リファレンス・辞典依存・`rulesetPrefix`           |
| [structure.md](./structure.md)           | 「1リポジトリ=1ルールセット」の標準ディレクトリ構成・配置先・コンテナ形式 |
| [sample-ruleset.md](./sample-ruleset.md) | 写経用テンプレート（manifest / index / docs / test）                      |
| [closed-source.md](./closed-source.md)   | 難読化・WASM・`.illruleset`・サーバー評価による保護段階                   |

テンプレートリポジトリ: **`illusions-lab/illusions-ruleset-template`**（`Use this template` から開始）。

## クイックスタート

### 1. テンプレートから作る

```bash
# GitHub の illusions-ruleset-template で "Use this template" → クローン
git clone https://github.com/<you>/<your-ruleset>.git
cd <your-ruleset>
npm install
```

### 2. メタを編集（manifest.json）

`id`（逆ドメイン推奨）, `nameJa`, `version`, `engineApi`(=1), `rulesetPrefix`、そして各ルールの
`rules[]`（`ruleId` / `level` / `defaultConfig` / `docs` 正負例）を記述する。manifest は
**コードを実行せずに**読まれる純データ。

### 3. ルールを書く（src/rules/<ruleId>.ts）

```ts
import type { LintRule, LintRuleConfig, RulesetContext, RulesetManifest } from "illusions-lint-sdk";

export function createMyRule(ctx: RulesetContext, manifest: RulesetManifest): LintRule {
  const meta = manifest.rules.find((r) => r.ruleId === "my-fw-exclaim")!;
  const { AbstractL1Rule } = ctx.bases; // ← import せず ctx から受け取る
  class MyRule extends AbstractL1Rule {
    lint(text: string, config: LintRuleConfig) {
      if (!config.enabled) return [];
      return ctx.toolkit.regexReplace({
        text,
        pattern: /！/,
        ruleId: this.id,
        severity: config.severity,
        message: "use !",
        messageJa: "全角『！』は半角『!』に。",
        replacement: () => "!",
      });
    }
  }
  return new MyRule(ctx.toolkit.toJsonRuleMeta(meta, manifest), {
    id: meta.ruleId,
    name: meta.nameJa,
    nameJa: meta.nameJa,
    description: meta.descriptionJa,
    descriptionJa: meta.descriptionJa,
    defaultConfig: meta.defaultConfig,
  });
}
```

**SDK は `import type` のみ**。基底クラス・道具は `ctx.bases` / `ctx.toolkit` から受け取る（未バンドルの
外部モジュールは値 import を実行時に解決できない）。

### 4. ドキュメントとテスト

- `docs/rules/<ruleId>.md` に「何をするルールか」を1ルール1ファイルで記述。
- `test/<ruleId>.test.ts` で positive 例→0 / negative 例→≥1 のゴールデン。

### 5. 検証してビルド

```bash
npm run check      # typecheck + test + build
```

`dist/index.js` + `manifest.json` が成果物。

### 6. 配布・公開

- `~/.illusions/rulesets/<id>/` に `dist/index.js` + `manifest.json` を置く（手動導入）。
- GitHub repo に topic **`illusions-ruleset`** を付けると、illusions マーケットプレイスが自動収集・公開する。
- `v*` タグを push するとリリースに成果物が添付される。

## 重要な制約

- `manifest.engineApi` は本体の `ENGINE_API_VERSION`（現在 **1**）と一致させる（不一致は隔離）。
- 辞典依存ルールは `requires: [{ kind: "dict", dictId: "genji" }]` を宣言（未DL時は自動無効化＋警告）。
- `ruleId` は安定値。`rulesetPrefix` で名前空間を付け、衝突を予防する。
