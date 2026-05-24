# 再実装 (3/5): ターミナル関連 #1473

## Goal

元 PR #1425 のうち **ターミナル関連の修正のみ** を、現 main に対し差分最小で再導入する。

### Codex レビュー後のスコープ確定（重要）

元 PR #1425 のターミナル変更は 2 点あった:

1. ターミナルタブの連番ラベル
2. パネルクローズ時の PTY kill

このうち **(2) PTY kill は dockview パネルクローズ経路についてのみ既に main に存在する**。`lib/editor-page/use-diff-tabs.ts` の `handleCloseTabWithPtyCleanup`（#1105 起因）が `app/page.tsx` L271/L295 で `useDockviewAdapter` に注入され、`onDidRemovePanel → closeTab` 経路を通る。

**ただし** Electron メニュー（Cmd+W = Close Tab）経由のクローズは `useElectronMenuBindings` 経由で `tabState.closeTab` を直接呼ぶ（`lib/tab-manager/index.ts:113`、`lib/tab-manager/use-electron-menu-bindings.ts:295`）。この経路では `isSyncingRef` ガードにより `onDidRemovePanel` 内の PTY kill が早期 return されるため、メニュー閉鎖時は PTY が孤立しうる。これは **元 PR #1425 でも解決されていなかった既存の問題** であり、本 issue のスコープ外として別 issue 化する（下の「Out of scope」参照）。

よって本 issue で再実装すべき残り作業は **(1) 連番ラベルのみ**。

非スコープ（同じ親 #1464 配下の別 issue で扱う）:

- MDI 空白段落の `[[blank]]` マーカー
- SearchDialog の React Portal 化
- `.txt` ファイル / VFS 再起動 / approved-vfs-paths
- dict-manager / nlp warmup / network-utils など、PR #1425 に同梱されていたターミナル以外の変更

## Architecture

- 影響ファイル: 1 ファイル編集 + 1 ファイル新規（純粋ヘルパー）+ 1 ファイル新規（テスト）。
- ヘルパー抽出により tautology テストを回避し、production コードを実際に exercise する。
- 既存 PTY kill 経路（`use-diff-tabs.ts`）には一切触らない。

## Tech Stack

- 言語: TypeScript（strict, no `any`）
- フレームワーク: React 18 hooks（`useRef`）
- テスト: vitest（jsdom 環境）

## Branch / PR Hygiene

- ブランチ: `feature/reimpl-terminal-1473`
- 親ブランチ: `dev`（CLAUDE.md §2: feature → dev）
- worktree: `../illusions-work-reimpl-terminal-1473`
- PR タイトル: `fix(terminal): re-introduce sequential terminal tab labels (#1473)`
- close キーワード: `closes #1473`

---

## Task 1: 連番ラベル採番ヘルパーを切り出す

### Files

- `lib/tab-manager/terminal-label.ts`（新規）

### Steps

- [ ] Step 1.1: 純粋関数 `nextTerminalLabel(counter)` を提供する小モジュールを新規作成
- [ ] Step 1.2: シグネチャは「`current` を持つ mutable オブジェクト（React の `MutableRefObject<number>` 互換）を受け取り、副作用として `current` を `+1` し、生成したラベルを返す」
- [ ] Step 1.3: 副作用とラベル文字列を 1 か所に閉じ込め、テストから直接呼べるようにする

### Exact code

```ts
// lib/tab-manager/terminal-label.ts
/**
 * Mutable counter abstraction compatible with React's MutableRefObject<number>.
 * Defined here to keep this module test-friendly without importing React.
 */
export interface TerminalLabelCounter {
  current: number;
}

/**
 * Allocate the next sequential terminal tab label (`ターミナル 1`, `ターミナル 2`, …).
 *
 * Side effect: increments `counter.current` by 1.
 * Used by `useTabState.newTerminalTab`. Extracted as a pure helper so that the
 * numbering contract can be regression-tested without `@testing-library/react`.
 *
 * Regression target: PR #1425 / issue #1473
 */
export function nextTerminalLabel(counter: TerminalLabelCounter): string {
  counter.current += 1;
  return `ターミナル ${counter.current}`;
}
```

### Verify

```bash
pnpm tsc --noEmit
```

---

## Task 2: `newTerminalTab` をヘルパーに置き換える

### Files

- `lib/tab-manager/use-tab-state.ts`（編集）

### Steps

- [ ] Step 2.1: Task 1 のヘルパーを import
- [ ] Step 2.2: `terminalCounterRef` を追加し、`newTerminalTab` 内で `nextTerminalLabel(terminalCounterRef)` を呼ぶ
- [ ] Step 2.3: ハードコード `label: "ターミナル"` を生成ラベルに差し替え
- [ ] Step 2.4: 既存の `useRef`/`useCallback` import を流用し、新規 React import なし

### Exact change

`lib/tab-manager/use-tab-state.ts`:

import 群に追加:

```diff
 import { createNewTab, generateTabId } from "./types";
 import type { TabManagerCore } from "./types";
+import { nextTerminalLabel } from "./terminal-label";
 import { useEditorMode } from "@/contexts/EditorModeContext";
```

L164 付近、`newTerminalTab` を書き換え:

```diff
+  const terminalCounterRef = useRef(0);
+
   const newTerminalTab = useCallback((pendingId?: string) => {
+    const label = nextTerminalLabel(terminalCounterRef);
     const tab: TerminalTabState = {
       tabKind: "terminal",
       id: generateTabId(),
       sessionId: "",
       pendingId: pendingId ?? null,
-      label: "ターミナル",
+      label,
       cwd: "",
       shell: "",
       status: "connecting",
```

### Verify

```bash
pnpm tsc --noEmit
pnpm lint
```

---

## Task 3: 連番ラベル regression test

### Files

- `lib/tab-manager/__tests__/terminal-label.test.ts`（新規）

### Steps

- [ ] Step 3.1: Task 1 で抽出した production ヘルパーを直接 import してテスト
- [ ] Step 3.2: 1 から開始することを assert
- [ ] Step 3.3: 連続呼び出しでインクリメントすることを assert
- [ ] Step 3.4: ラベル文字列のフォーマット（全角スペース 1 個、`ターミナル N`）を assert
- [ ] Step 3.5: counter の `current` が副作用で書き換わることを assert（同じ counter を共有した場合に連番が継続）

### Exact code

```ts
// lib/tab-manager/__tests__/terminal-label.test.ts
import { describe, it, expect } from "vitest";

import { nextTerminalLabel } from "@/lib/tab-manager/terminal-label";

/**
 * Regression test for PR #1425 / issue #1473.
 *
 * `newTerminalTab` in use-tab-state.ts uses nextTerminalLabel to allocate
 * sequential tab titles. This test exercises the same production helper
 * to ensure the numbering contract does not silently regress to a fixed
 * "ターミナル" label or to indices starting at 0.
 */
describe("nextTerminalLabel", () => {
  it("returns 'ターミナル 1' on the first call when counter starts at 0", () => {
    const counter = { current: 0 };
    expect(nextTerminalLabel(counter)).toBe("ターミナル 1");
  });

  it("increments sequentially across calls with the same counter", () => {
    const counter = { current: 0 };
    expect(nextTerminalLabel(counter)).toBe("ターミナル 1");
    expect(nextTerminalLabel(counter)).toBe("ターミナル 2");
    expect(nextTerminalLabel(counter)).toBe("ターミナル 3");
  });

  it("mutates counter.current as a side effect", () => {
    const counter = { current: 4 };
    nextTerminalLabel(counter);
    expect(counter.current).toBe(5);
  });

  it("uses an ASCII space and Japanese 'ターミナル' prefix (label format contract)", () => {
    const counter = { current: 0 };
    const label = nextTerminalLabel(counter);
    expect(label).toMatch(/^ターミナル \d+$/);
  });
});
```

### Verify

```bash
pnpm test -- terminal-label
```

4 件すべて pass。

---

## Task 4: 手動 regression テスト（受け入れ条件）

### Steps

- [ ] Step 4.1: `pnpm electron:dev`（または既存の dev コマンド）でアプリ起動
- [ ] Step 4.2: メニュー／コマンドからターミナルタブを 3 つ開き、タブタイトルが「ターミナル 1」「ターミナル 2」「ターミナル 3」になることを確認
- [ ] Step 4.3: いずれかのターミナルで `echo $$`（Unix）/ `$$PID`（PowerShell）を実行して shell プロセスの PID を控える
- [ ] Step 4.4: **dockview のタブ × ボタン（パネルクローズコントロール）** で該当タブを閉じる（Cmd+W ではない — Cmd+W 経路は本 PR スコープ外）。`pty.kill` は renderer から fire-and-forget され main 側の `onExit → removeSession` が非同期で発火するため、即時に `ps -p <PID>` を叩くと一瞬残っていることがある。1〜2 秒待つ、または短いポーリングループ（例: `for i in 1 2 3 4 5; do ps -p <PID> -o pid= 2>/dev/null || { echo gone; break; }; sleep 0.5; done`）で「最終的に消える」ことを確認する。これは既存経路（`use-diff-tabs.ts`）が壊れていないことを確かめる回帰チェックで、本 PR の変更点（連番ラベル）の検証ではない
- [ ] Step 4.5: 残ったターミナルを閉じても他タブ（editor）のラベルや状態に副作用が出ないこと
- [ ] Step 4.6: P0 #1457（editor 編集不可）/ #1445 の挙動が再発しないことを目視確認（editor 操作・縦書きトグル）
- [ ] Step 4.7: 4 つ目のターミナルを開いた際にラベルが「ターミナル 4」になること（counter がタブクローズ後もリセットされない仕様）

### Expected output

- タブタイトルが連番表示される
- 既存 PTY kill 経路が引き続き動作する（shell PID が消える）
- editor 系の挙動が変わらない

---

## Out of scope / 既知の制約

- **PTY kill ロジックは再導入しない（dockview 経路）**: 元 PR #1425 のこの部分は #1105 起因の `handleCloseTabWithPtyCleanup` として dockview パネルクローズ経路には既に main に存在する（`lib/editor-page/use-diff-tabs.ts` L44–55）。本 PR では touch しない。
- **Electron メニュー Cmd+W 経由は PTY が孤立する既知バグ**: `useElectronMenuBindings` は `tabState.closeTab` を直接呼び（`lib/tab-manager/index.ts:113`、`lib/tab-manager/use-electron-menu-bindings.ts:295`）、`handleCloseTabWithPtyCleanup` を経由しない。元 PR #1425 でもこの経路は修正されていなかったため、本 issue でも対象外とし、フォローアップとして **別 issue を起票する**（PR 本文の Follow-up セクションで参照）。
- **複数ウィンドウ間のラベル一意性**: 各ウィンドウは独自の `terminalCounterRef` を持つため、ウィンドウ A の「ターミナル 1」とウィンドウ B の「ターミナル 1」が併存しうる。元 PR #1425 と同等。
- **再起動後の counter**: ターミナルタブは永続化対象外（`lib/tab-manager/use-tab-persistence.ts` L127 で `editorTabs` のみフィルタ。`lib/dockview/use-dockview-persistence.ts` でも terminal キーは ephemeral として除外）。よって再起動後は counter が 0 から再開し、復元タブとの重複問題は発生しない。
- **PTY kill 失敗時のリカバリ**: 既存経路の `pty:kill` は fire-and-forget。main 側 `terminal-session-registry` の `killAllSessions` / `killSessionsForWindow` がバックストップ。本 PR で影響なし。

## 参考

- 元 PR: #1425（マージ済み、v1.2.5 で導入 → v1.2.7 で全体ロールバック）
- 親 issue: #1464
- 関連 P0 regression: #1457, #1445（本 PR では再発させない）
- 既存 PTY infra: `electron/ipc/pty-ipc.js`, `electron/ipc/terminal-session-registry.js`
- 既存 PTY kill 経路: `lib/editor-page/use-diff-tabs.ts:44-55`（#1105）

---

## Review history

### Review Iteration 1（2026-05-23）

#### Accepted

- **R1 (CRITICAL)**: Task 2 の PTY kill 追加は **重複実装**。`use-diff-tabs.ts:44–55` の `handleCloseTabWithPtyCleanup` が `app/page.tsx:271/295` 経由で既に同経路を通っている。Task 2 を完全削除し、PTY kill は既存実装に委ねる方針に変更。
- **R2 (IMPORTANT)**: 元の regression test はテストファイル内でロジックを再実装する tautology だった。`nextTerminalLabel` を `lib/tab-manager/terminal-label.ts` に純粋ヘルパーとして抽出し、テストは実際の production コードを exercise するように変更。
- **R3 (IMPORTANT)**: `ps aux | grep node-pty` は誤り（node-pty はライブラリ名、spawn されるのは shell プロセス）。手動テストを `echo $$` → `ps -p <PID>` で PID 単位の死活確認に修正。
- **R4 (SUGGESTION)**: ターミナルタブは `use-tab-persistence.ts` および `use-dockview-persistence.ts` で永続化対象外であることを確認。「ラベル重複を許容」ではなく「再起動後は ephemeral」と out-of-scope セクションを正確化。

#### Rejected

なし

#### Partially Accepted

なし

### Review Iteration 2（2026-05-23）

#### Accepted

- **R5 (IMPORTANT)**: 「PTY kill は既に main で universal にカバー」という当初の言い回しは誇大。dockview の `onDidRemovePanel` 経路は `handleCloseTabWithPtyCleanup` でカバーされているが、Electron メニューの Cmd+W は `useElectronMenuBindings → tabState.closeTab` を直接呼ぶため `isSyncingRef` ガードにより `onDidRemovePanel` 内の PTY kill を早期 return させ、PTY が孤立する。これは元 PR #1425 でも未修正の既存問題。Goal セクションと Out of scope セクションで「dockview 経路のみカバー、Cmd+W は既知バグ・別 issue」と明示。フォローアップ issue を PR 本文に記載予定。
- **R6 (SUGGESTION)**: Step 4.4 を「dockview のタブ × ボタンでクローズ → 1–2 秒待つかポーリング」と timing 明示版に修正。`pty.kill` の fire-and-forget と main 側 `onExit` の非同期性に起因する flakiness を回避。

#### Rejected

なし

#### Partially Accepted

なし

#### スコープ判断ノート

- R5 で発覚した Cmd+W バグはスコープ拡大の誘因になりうるが、(a) 元 PR #1425 でも未修正、(b) 連番ラベルとは独立した問題、(c) #1457/#1445 の P0 regression と無関係 — の 3 点から、本 issue では扱わずフォローアップ issue とする。これは CLAUDE.md §8（Codex の指摘に同意しない権利）の適用例ではなく、Codex 自身が R5 で提示した 2 つの選択肢「scope を絞る／expand する」のうち前者を選択している。

### Review Iteration 3（2026-05-23）

**Verdict: APPROVED**

Codex は R5/R6 が十分に対処されたことを確認。新たな issue なし、execute 可能と判定。スコープ判断（Cmd+W リークを別 issue に切り出す）も「正しい境界」として承認。
