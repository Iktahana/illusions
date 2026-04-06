---
title: 文書化ギャップマップ
slug: documentation-gap-map
type: architecture
status: active
updated: 2026-04-06
tags:
  - architecture
  - docs
  - roadmap
---

# 文書化ギャップマップ

このページは、「実装や機能としては既に存在するが、`docs/` に正式な説明ページがまだないもの」を整理するための地図です。  
ここでは editor 本体の排版・scroll・selection 系は意図的に除外しています。

## 判断基準

このマップに載せる対象は、次の条件を満たすものです。

- 単一コンポーネントではなく、複数ファイルにまたがる実装がある
- ユーザー機能または独立したサブシステムとして既に成立している
- 現在の `docs/` に同等の正式ページがない

## 優先度 A: 次に棚卸しするもの

### Characters / extraction / per-project persistence

役割管理と抽出設定は存在しますが、今の時点では「独立機能としての仕様」と「AI 補助設定」の境界がやや曖昧です。

既存の主な入口:

- `components/Characters.tsx`
- `lib/editor-page/use-ai-settings.ts`
- `lib/storage/storage-types.ts`

次の判断が必要です。

- 専用 architecture ページを作るか
- account / AI 機能の一部としてまとめるか

### Account / auth

Web OAuth と account settings はありますが、製品契約面やクラウド同期の範囲がまだ十分に文書化できるほど固まっていない可能性があります。

既存の主な入口:

- `lib/auth/web-auth.ts`
- `components/settings/AccountSettingsTab.tsx`
- `contexts/AuthContext`

現時点では、先に実装の安定度を見極めてから独立ページ化するのが安全です。

## 完了した項目 (2026-04-06)

以下の項目は、優先度 A の補完計画に基づきドキュメント化が完了しました。

1. **Dockview / pane layout** → `docs/architecture/dockview-layout.md`
2. **Terminal subsystem** → `docs/architecture/terminal-system.md`, `docs/guides/terminal.md`
3. **Keymap system** → `docs/architecture/keymap-system.md`
4. **Project upgrade / permissions** → `docs/architecture/project-upgrade-and-permissions.md`
5. **User dictionary / ignored corrections** → `docs/architecture/dictionary-and-ignored-corrections.md`, `docs/guides/dictionary.md`
6. **Onboarding / welcome flow** → `docs/guides/onboarding-and-welcome-flow.md`

## 既存文書との切り分け

このギャップマップは、既存ページを置き換えるものではありません。

- `storage-system.md`
  - storage abstraction 自体を説明する
- `tab-manager.md`
  - tab CRUD と保存・復元の骨格を説明する
- `project-lifecycle.md`
  - project mode / standalone mode の基礎を説明する
- `keyboard-shortcuts.md`
  - ユーザー向けのショートカット参照を提供する
