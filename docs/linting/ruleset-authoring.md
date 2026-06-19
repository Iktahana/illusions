---
title: 校正ルールセット作成ガイド (Ruleset Authoring)
status: draft
updated: 2026-06-19
---

# 校正ルールセット作成ガイド

illusions の校正(lint)ルールは **ルールセット**という単位で配布される。ルールセットは
`RulesetModule` を default export する**コードモジュール**で、`createRules(ctx)` が
具体的な `LintRule[]` を返す。

- 組み込みルールセット: illusions 本体に同梱（静的 import）。
- 外部ルールセット: `~/.illusions/rulesets/<id>/` に配置（Electron のみ。後続フェーズで読込配線）。

> 本ドキュメントは**底層 SDK の契約**を説明する。実ルールの移行・外部ローダ実装は後続。

## 1. モジュール契約

ルールセットは次の形を default export する（`@/lib/linting/sdk` の `RulesetModule`）。

```ts
import type { RulesetModule, RulesetContext } from "@/lib/linting/sdk";

const ruleset: RulesetModule = {
  manifest: {
    id: "com.example.my-rules", // 逆ドメイン推奨。"builtin." は予約
    name: "My Rules",
    nameJa: "わたしの校正規約",
    version: "1.0.0",
    engineApi: 1, // ENGINE_API_VERSION と一致必須
    license: "MIT",
    guidelines: [
      {
        id: "my-guideline",
        nameJa: "わたしの規約",
        publisherJa: "—",
        year: null,
        license: "Public",
        descriptionJa: "サンプル規約",
      },
    ],
    rules: [
      {
        ruleId: "my-fw-exclaim",
        nameJa: "全角！の検出",
        descriptionJa: "…",
        guidelineId: "my-guideline",
        level: "L1",
        defaultConfig: { enabled: true, severity: "info" },
        docs: {
          positiveExample: "すごい!",
          negativeExample: "すごい！",
          sourceReference: "サンプル",
        },
      },
    ],
  },
  createRules(ctx: RulesetContext) {
    // ↓ 第2章を参照
    return [];
  },
};

export default ruleset;
```

### manifest は「コードを実行せずに」読める

`manifest` は純データ。UI 一覧表示・`engineApi` 整合チェック・隔離(quarantine)判定に使われ、
**`createRules` を呼ばずに**読まれる。だから `manifest` に副作用や計算結果を入れない。

### ruleId / guidelineId は安定値

ユーザー設定・プリセット・保存済み状態と結びつくため、一度公開した `ruleId` / `guidelineId` は変えない。

## 2. createRules(ctx) と RulesetContext

`createRules` は `ctx` から**基底クラスと道具**を受け取る。**直接 import しない**（第4章）。

```ts
createRules(ctx) {
  const { AbstractL1Rule } = ctx.bases;
  const manifest = ruleset.manifest;

  class FwExclaimRule extends AbstractL1Rule {
    lint(text: string, config) {
      if (!config.enabled) return [];
      return ctx.toolkit.regexReplace({
        text,
        pattern: /！/,
        ruleId: this.id,
        severity: config.severity,
        message: "Use half-width ! ",
        messageJa: "全角『！』は半角『!』にしてください。",
        replacement: () => "!",
      });
    }
  }

  const meta = ruleset.manifest.rules[0];
  return [
    new FwExclaimRule(ctx.toolkit.toJsonRuleMeta(meta, manifest), {
      id: meta.ruleId, name: meta.nameJa, nameJa: meta.nameJa,
      description: meta.descriptionJa, descriptionJa: meta.descriptionJa,
      defaultConfig: meta.defaultConfig,
    }),
  ];
}
```

### ctx.toolkit（DetectorToolkit）リファレンス

車輪の再発明を避けるための共有検出器。**監査(Tier A/B/C)の修正はここに集約**されているので、
自前で正規化やマッピングを書かず必ずこれを使う。

| 道具                                    | 用途                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `nfkc(s)`                               | NFKC 正規化。半角カナ＋濁点を合成（`ﾄﾞ`→`ド`）。**ハードコード変換表の代わり** |
| `charMap(map)` / `applyCharMap(map, s)` | 個別文字マップ（NFKC で賄えない curated 変換のみ）                             |
| `regexReplace(opts)`                    | regex 走査→ `LintIssue[]`。global 化と zero-width 対策込み                     |
| `detectUnits(opts)`                     | 単位表記の誤りを検出。**同一スパン重複を自動除去（Tier A）**                   |
| `matchWordList(text, words)`            | 固定語彙の位置検出（長い語優先）                                               |
| `dedupe(issues, key?)`                  | スパン重複の除去（Tier A/C）                                                   |
| `posFilter(tokens, pred)`               | 形態素(L2)トークンの絞り込み                                                   |
| `toJsonRuleMeta(rule, manifest)`        | 基底コンストラクタ用 meta を生成（ボイラープレート削減）                       |
| `dict`                                  | 辞典アクセス（第3章。未DL時フェイルセーフ）                                    |

## 3. 辞典に依存するルール（requires）

辞典(幻辞 Genji)が要るルールは manifest で宣言する。

```ts
{ ruleId: "needs-dict", /* … */, requires: [{ kind: "dict", dictId: "genji" }] }
```

挙動（SDK が吸収）:

- 辞典が `ready` でない（未DL/破損/Web/不明）とき、registry が**当該ルールを自動 disable** し、
  **日本語警告を1回**出す（「このルールは幻辞辞典が必要です。設定からダウンロードしてください」）。
- `ctx.toolkit.dict.lookupBatch()` / `has()` は未 ready 時に**空を返す**フェイルセーフ。ルール側で分岐不要。

## 4. SDK 依存のルール（重要）

外部ルールセットは**バンドルされない素の JS**として読み込まれるため、`@/lib/linting/sdk` からの
**値 import は実行時に解決できない**。

- ✅ 型は `import type { … } from "@/lib/linting/sdk"` のみ可（実行時に消える）。
- ✅ 基底クラス・道具は **`ctx.bases` / `ctx.toolkit` 経由**で受け取る。
- ❌ `import { AbstractL1Rule } from "@/lib/linting/sdk"`（値 import）は外部ルールセットで使わない。

組み込みルールセット（本体同梱）は値 import 可だが、将来 1 リポジトリへ切り出す可能性を考え、
最初から `ctx` 経由で書くのが無難。

## 5. テスト（必須）

各ルールに **positive 例→0 issue / negative 例→≥1 issue** のゴールデンテストを付ける。
`manifest.rules[].docs` の例をそのままテスト入力にすると、目録とテストが同期する。

```ts
const ruleset = (await import("../index")).default;
const ctx = makeTestContext(); // bases + toolkit を渡す
const rules = ruleset.createRules(ctx);
const rule = rules.find((r) => r.id === "my-fw-exclaim")!;
const cfg = { enabled: true, severity: "warning" } as const;
expect(rule.lint("すごい!", cfg)).toHaveLength(0); // positive
expect(rule.lint("すごい！", cfg).length).toBeGreaterThan(0); // negative
```

## 関連

- リポジトリ構造: [ruleset-structure.md](./ruleset-structure.md)
- sample テンプレート: [sample-ruleset.md](./sample-ruleset.md)
- クローズドソース配布: [closed-source.md](./closed-source.md)
