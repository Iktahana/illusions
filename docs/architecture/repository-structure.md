---
title: リポジトリ構造
slug: repository-structure
type: architecture
status: active
updated: 2026-07-08
owner: maintainers
---

# リポジトリ構造

この文書は 1.3.0 以降のリポジトリ整理方針を定義します。目的は、ルート直下の雑多なディレクトリを減らし、ソースコード・プラットフォーム境界・機能単位・ドキュメント・生成物の責務を明確にすることです。

## 目標構造

```text
illusions/
  app/
  application/
  features/
  shared/
  platform/
  electron/
  packages/
  public/
  assets/
  build/
  quicklook/
  store/
  scripts/
  docs/
  types/
  generated/

  README.md
  LICENSE
  NOTICE
  TERMS.md
  package.json
  package-lock.json
  next.config.ts
  tsconfig.json
  eslint.config.mjs
  vitest.config.ts
  tailwind.config.ts
  postcss.config.mjs
  vercel.json
  .env.example
  .gitignore
  .nvmrc
  .prettierrc
  .prettierignore
```

ルート直下には、プロジェクト入口、設定、ライセンス、ポリシー、最上位の所有境界だけを置きます。実装の詳細や一時的な計画書はルートに置きません。

## アプリケーション入口

`app/` は Next.js App Router の入口です。route、layout、error boundary、offline page、global CSS、API route、service worker などに限定します。

`app/page.tsx` は最終的に薄い render boundary にします。

```tsx
import { EditorApp } from "@/application/EditorApp";

export default function Page() {
  return <EditorApp />;
}
```

`application/` は renderer アプリの組み立て層です。provider 構成、アプリ shell、起動処理、feature 間の wiring など、単一 feature に属さない composition を置きます。

```text
application/
  EditorApp.tsx
  AppProviders.tsx
  shell/
  startup/
```

`application/` は feature を compose できますが、feature 内部から `application/` へ依存してはいけません。

## 機能スライス

`features/` はプロダクト機能単位の所有境界です。各 feature は UI、model、hooks、services、worker、tests を自分の配下に持ちます。

```text
features/
  workspace/
  editor/
  proofreading/
  dictionary/
  search/
  settings/
  terminal/
```

各 feature は小さな public API を `index.ts` から公開します。他 feature は内部ファイルではなく、この public API を通して利用します。

```text
features/editor/
  index.ts
  model/
  ui/
  hooks/
  services/
  worker/
  __tests__/
```

所有範囲は次の通りです。

- `workspace`: project、files、tabs、Dockview、history、diff、project permissions。
- `editor`: editor lifecycle、Milkdown integration、formatting、statistics、display mode、manuscript UI。
- `proofreading`: linting、corrections、ignored corrections、rulesets、proofreading worker、NLP-facing proofreading integration。
- `dictionary`: user dictionary、dictionary UI、dictionary settings。
- `search`: search dialog/results、in-document search、project search worker。
- `settings`: settings shell、tab registry、settings tabs。
- `terminal`: terminal panel、terminal tab state、PTY renderer bridge。

## 共有コード

`shared/` は feature 固有ではない汎用コードだけを置きます。

```text
shared/
  ui/
  lib/
  types/
```

ルール:

- `shared/` は `features/`、`application/`、`app/`、`electron/` に依存しません。
- 2 つの feature で使うだけの business policy は `shared/` に逃がさず、明確な owner feature を決めます。
- `shared/ui/` は dialog、field、layout primitive など、プロダクト文脈を持たない UI に限定します。

## プラットフォーム境界

`platform/` は renderer 側の環境差分 adapter を置きます。

```text
platform/
  browser/
    storage.ts
    vfs.ts
    nlp-client.ts
  electron-renderer/
    storage.ts
    vfs.ts
    nlp-client.ts
```

Browser 実装と Electron renderer 実装は明示的に分けます。renderer code は platform adapter を通して機能を使い、Electron main process module を直接 import しません。

`electron/` は Electron main process、preload bridge、IPC、native menu、auto update、OS integration、Node-only service を所有します。

```text
electron/
  main.js
  preload.js
  menu.js
  window-manager.js
  ipc/
  lib/
  __tests__/
```

filesystem、shell、updater、native dialog などの privileged API は preload/IPC 境界の内側に閉じ込めます。

## パッケージ

`packages/` は独立して build/test できる内部 package を置きます。

```text
packages/
  milkdown-plugin-japanese-novel/
  illusions-lint-sdk/
```

Package code は application alias に依存しません。特に `@/components`、`@/lib`、`@/features` を package から import してはいけません。package 固有の API 説明は package 内 README に置けます。

## アセットと生成物

`public/` は runtime web assets です。Next.js またはアプリが runtime に読む icon、logo、font、dictionary、service worker 関連ファイルを置きます。

`build/` は installer、signing、Electron Builder 用 assets です。`.icns`、`.ico`、entitlements、AppX tile assets などを置きます。

`assets/source/` は編集可能な source asset です。`.psd`、`.ai`、branding source file など、runtime に直接読み込まない素材を置きます。

`generated/` は commit が必要な生成物だけを置きます。各ファイルは生成コマンドを documentation または script 名で追跡できる必要があります。

`.next/`、`dist-main/`、`dist-electron/`、`tsconfig.tsbuildinfo`、一時レポート、local worktree は source として扱いません。

## Store と release material

`store/` は Apple / Microsoft Store の listing copy と store-specific metadata を置きます。これは engineering documentation ではありません。

```text
store/
  apple/
  microsoft/
  _shared/
```

Release 手順、submission checklist、運用メモは `docs/release/` に置きます。

## ドキュメント

`docs/README.md` を canonical entrypoint とします。

```text
docs/
  README.md
  Home.md
  architecture/
  guides/
  ruleset/
  MDI/
  release/
  setup/
  references/
  archive/
    plans/
    investigations/
```

ルール:

- 現在の実装事実は `docs/architecture/` に置きます。
- 操作手順や開発ガイドは `docs/guides/` に置きます。
- MDI format の事実は `docs/MDI/` に置きます。
- Ruleset authoring の事実は `docs/ruleset/` に置きます。
- 完了済み plan、古い investigation、単発 report は `docs/archive/` に置きます。
- 一時的な作業 plan は repository ではなく OS の temp directory に置きます。

## 互換 root files

次の root file は compatibility または tooling requirement を確認してから薄い pointer 化または削除します。

- `ARCHITECTURE.md`: `docs/architecture/` への pointer にするか、内容を docs に移します。
- `MDI.md`: `docs/MDI/spec.md` への pointer にするか、参照更新後に削除します。
- `CLAUDE.md`: 現行 tooling が root から読む場合だけ保持します。
- `.cursorrules`: 現行 Cursor workflow が必要とする場合だけ保持します。

## 移行順序

1. Root と docs の inventory を取ります。
2. 一時 plan 置き場を repository から取り除きます。
3. 生成物・local artifact が source と混ざらないようにします。
4. Import boundary checker を強化します。
5. `workspace` から feature slice へ移動します。
6. `editor`、`search`、`dictionary`、`proofreading`、`settings`、`terminal` を順に移動します。

大規模な move は behavior change と同じ PR に混ぜません。
