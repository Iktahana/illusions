---
title: 文書化ギャップマップ
slug: documentation-gap-map
type: architecture
status: active
updated: 2026-04-03
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

## 優先度 A: 先に正式文書を作るべきもの

### 1. Dockview / pane layout

現在の `docs/` には、dockview がレイアウト・永続化・panel 種別をどう扱うかの正式説明がありません。

既存の主な入口:

- `lib/dockview/use-dockview-adapter.ts`
- `lib/dockview/use-dockview-persistence.ts`
- `lib/dockview/dockview-components.tsx`
- `lib/storage/app-state-manager.ts`
- `app/page.tsx`

文書化すべき内容:

- editor / terminal / diff tab を dockview panel にどう載せるか
- stable key と simplified layout の考え方
- per-window persistence と global fallback
- split-pane の復元条件

推奨追加ページ:

- `docs/architecture/dockview-layout.md`

### 2. Terminal subsystem

Electron 専用 terminal tab は、機能としては既に成立していますが、正式ページがありません。

既存の主な入口:

- `components/TerminalPanel.tsx`
- `lib/editor-page/use-terminal-tabs.ts`
- `electron/ipc/pty-ipc.js`
- `electron/ipc/terminal-session-registry.js`
- `components/settings/TerminalSettingsTab.tsx`

文書化すべき内容:

- terminal tab の生成・終了・強制 close
- PTY session と tab の関連付け
- Electron-only 制約
- terminal settings の永続化項目

推奨追加ページ:

- `docs/architecture/terminal-system.md`
- `docs/guides/terminal.md`

### 3. User dictionary / ignored corrections

辞書と校正の無視機構は、校正システムの一部として重要ですが、独立した説明がありません。

既存の主な入口:

- `lib/services/user-dictionary-service.ts`
- `lib/services/ignored-corrections-service.ts`
- `components/Dictionary.tsx`
- `components/inspector/CorrectionsPanel.tsx`
- `lib/editor-page/use-ignored-corrections.ts`

文書化すべき内容:

- project mode と standalone mode での保存先の違い
- `user-dictionary.json` と storage-backed fallback
- ignored correction の context/hash ベース判定
- context menu / inspector からの操作導線

推奨追加ページ:

- `docs/architecture/dictionary-and-ignored-corrections.md`
- `docs/guides/dictionary.md`

### 4. Project upgrade / permissions / recent project restore

`project-lifecycle.md` では吸収しきれていない、実際の upgrade と permission flow があります。

既存の主な入口:

- `lib/project/project-upgrade.ts`
- `lib/editor-page/use-project-lifecycle.ts`
- `lib/editor-page/use-recent-projects.ts`
- `components/PermissionPrompt.tsx`
- `components/UpgradeToProjectBanner.tsx`

文書化すべき内容:

- standalone から project への昇格
- directory handle の再利用と permission 再確認
- recent project の再オープン
- permission prompt の出し分け

推奨追加ページ:

- `docs/architecture/project-upgrade-and-permissions.md`

### 5. Keymap system

現在あるのは「ショートカット一覧」で、keymap の設計文書ではありません。

既存の主な入口:

- `lib/keymap/command-ids.ts`
- `lib/keymap/shortcut-registry.ts`
- `lib/keymap/keymap-storage.ts`
- `lib/keymap/use-keymap-listener.ts`
- `contexts/KeymapContext.tsx`
- `electron/menu.js`

文書化すべき内容:

- command id と menu action の違い
- default binding と override のマージ
- conflict resolution
- Electron menu accelerator との同期

推奨追加ページ:

- `docs/architecture/keymap-system.md`

### 6. Onboarding / welcome flow

初回導線や新規ウィンドウ導線は製品として重要ですが、正式なフロー文書がありません。

既存の主な入口:

- `components/WelcomeScreen.tsx`
- `components/CreateProjectWizard.tsx`
- `components/PermissionPrompt.tsx`
- `app/page.tsx`

文書化すべき内容:

- welcome screen の役割
- 新規プロジェクト作成フロー
- 新規ウィンドウで `?welcome` を使う理由
- auto-restore と welcome 表示の分岐

推奨追加ページ:

- `docs/guides/onboarding-and-welcome-flow.md`

## 優先度 B: 次に棚卸しするもの

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

不足しているのは、これらの文書からあふれている周辺システムの正式入口です。

## 次の補文順

推奨順は次のとおりです。

1. `dockview-layout`
2. `terminal-system`
3. `keymap-system`
4. `project-upgrade-and-permissions`
5. `dictionary-and-ignored-corrections`
6. `onboarding-and-welcome-flow`

この順なら、まず現在の UI 構成と状態永続化の骨格が揃い、その後に運用・補助機能を補えます。
