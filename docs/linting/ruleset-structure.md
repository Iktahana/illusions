---
title: ルールセット・リポジトリ構造
status: draft
updated: 2026-06-19
---

# ルールセット・リポジトリ構造（1リポジトリ = 1ルールセット）

校正ルールセットは独立した単位として開発・配布できる。標準構造は以下。

```
my-ruleset/
  manifest.json         # RulesetManifest と同じ形（コードを実行せず読める純データ）
  index.js              # default export: RulesetModule（ビルド済み単一ファイル）
  src/                  # 開発用 TypeScript（任意。ビルドして index.js を生成）
    rules/<ruleId>.ts
  docs/                 # 校正目録：ルールごとの意図・正負例・出典
    <ruleId>.md
  test/                 # ゴールデンテスト（positive→0 / negative→≥1）
    <ruleId>.test.ts
  README.md             # SDK 依存は import type のみ／実行は ctx 経由（重要）
  package.json          # devDependency に型のみ（@/lib/linting/sdk 相当）
```

## 配置先（2系統のソース）

ローダは「どこからルールセットのバイトを得るか」を抽象化する（`RulesetSourceAdapter`）。
**不変条件: manifest は常にコードを実行せずに読める。**

| ソース      | 形                                                     | 用途                             | 対象                  |
| ----------- | ------------------------------------------------------ | -------------------------------- | --------------------- |
| `builtin`   | 本体に静的 import                                      | illusions 同梱の標準ルールセット | Web + Electron        |
| `folder`    | `~/.illusions/rulesets/<id>/{manifest.json, index.js}` | 手元開発・手動導入               | Electron のみ         |
| `container` | 単一ファイル `<id>.illruleset`                         | 配布・クローズドソース           | Electron のみ（後続） |

- **Web 版**はファイルシステムを持たないため、外部(folder/container)は読み込まれず**組み込みのみ**で縮退する。
- 組み込みルールセットは本体ディレクトリ `lib/linting/rulesets/<id>/index.ts`（TS のまま本体ビルドで bundle）に置く。
- `folder` と `container` の `RulesetModule` 契約は組み込みと**同一**＝同じ書き方で書け、配置先だけ違う。

## `.illruleset` 単一ファイルコンテナ（後続フェーズ）

配布・クローズドソース向けの単一ファイル形式。**平文ヘッダ + ペイロード**で構成する。

```
[ JSON header (plaintext) ]   ← magic="ILLRULESET", containerVersion, manifest, payload{kind,encoding,bytes}
[ payload bytes ]             ← バンドル済み JS（難読化可）または WASM
```

ヘッダを平文にする理由は不変（manifest をコード非実行で読むため）。隠せるのはペイロードのみ。
型は `lib/linting/registry/ruleset-source.ts` の `IllrulesetContainerHeader` に予約済み（実装は配布フェーズ）。

## 関連

- 作成ガイド: [ruleset-authoring.md](./ruleset-authoring.md)
- sample テンプレート: [sample-ruleset.md](./sample-ruleset.md)
- クローズドソース配布: [closed-source.md](./closed-source.md)
