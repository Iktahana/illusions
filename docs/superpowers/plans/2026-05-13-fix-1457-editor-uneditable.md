# Plan: Fix #1457 — エディタ編集不能 & 縦書き/横書き切替不可 (P0 BUG)

## Goal

v1.2.5 リリース後に発覚した P0 BUG (#1457) を最小限の介入で修復する。具体的には次の 2 つの可観測症状を、それぞれ独立した根本原因に対するピンポイント修正で解消する。

1. エディタ領域をクリックすると先頭にジャンプし、カーソルが消失して編集不能になる
2. 縦書き ⇔ 横書きモードの切替が反応しない、または切替後にコンテンツが古い状態に戻る

Issue 本文で言及された「Windows 省電力モード時のプロセス無反応」はスコープ外とし、フォロー Issue を起票して別途対応する。これは A/B とは異なる根本原因を持つ可能性が高く、本 PR の爆発半径を大きくしてしまうため。

## Architecture

### 現状の症状ごとの根本原因

**Root cause A — 編集不能 (PR #1427 regression)**

`useFileWatchIntegration` (`lib/tab-manager/use-file-watch-integration.ts`) は `pauseFileWatchers` フラグの変化に応じて `FileWatcher.start()` / `stop()` を呼び分ける。このフラグは `app/page.tsx:235` で `shouldPauseFileWatchers(runtimeActivity)` から計算され、`runtimeActivity.isWindowFocused` が false になっただけで true になる (`lib/editor-page/power-optimization.ts:21-23`)。

`ElectronFileWatcher` (`lib/services/file-watcher.ts:385-486`) の `start()` 経路には catch-up ロジックがあり、`pausedAt > previousModified` の場合に「一時停止中に変更があったかもしれない」と判定して `onChanged()` を発火する (`catchUpAndStartWatcher`)。

問題は、`readAndNotify()` (line 547-551) が suppression 中に early return しており、`lastKnownModified` / `lastKnownContentHash` を更新しない点。auto-save (5 秒ごと) によるディスク書き換えは suppression 内で起きるため：

1. auto-save 走行 → ディスク mtime が進む → `suppressFileWatch()` 発動 → `readAndNotify()` 早期 return → **baseline 更新されない**
2. ユーザー Cmd+Tab → `pauseFileWatchers=true` → watcher.stop() → `pausedAt = Date.now()`
3. ユーザー focus 復帰 → `pauseFileWatchers=false` → watcher.start() → catch-up
4. `previousModified` (auto-save 前の古い mtime) < 現 mtime → `mtimeAdvanced=true` → suppression 切れていれば `onChanged()` 発火
5. `useFileWatchIntegration` の `buildOnChanged` で `pendingExternalContent: diskContent` をセット
6. `MilkdownEditor.tsx:321-348` の useEffect が `editor.action(replaceAll(externalContent))` を実行
7. ProseMirror ドキュメント全置換 → スクロール位置・カーソル位置喪失 → 編集続行不能

メモリ S143 / 645 / 662 / 738 で観測済みのフロー。

**Root cause B — 縦書き切替不可**

`MilkdownEditor.tsx` の `useEditor` フックは deps 配列に `isVertical` を含む (`components/editor/MilkdownEditor.tsx:282`)。React の `isVertical` 切替で Milkdown Editor 全体 (commonmark + gfm + japaneseNovel + history + clipboard + cursor + posHighlight + linting プラグイン) が破棄・再作成される。

問題点：

- 巨大ファイル + 縦書き再構築は十数〜数百 ms かかる → UI が無反応に見える
- `initialContentRef = useRef<string>(initialContent)` (line 137) はマウント時の値で固定。`useEditor` が deps 変更で再実行されても外側の React コンポーネントは再マウントされないため、`initialContentRef.current` は古いまま → 切替後のエディタが「過去のコンテンツ」で初期化される
- `useEditor` の暗黙の再生成は ProseMirror state を失うが React state はそのまま → 「半再作成」状態でユーザー入力が捨てられる可能性

### 修正アーキテクチャ

**Patch 1 — focus blur で file watcher を停止しない**

`isBackgroundWindow` の判定から `isWindowFocused` を外す。ファイル監視は visibility 喪失時のみ停止する。他の non-critical 処理 (POS highlight / readability morphology) は別途独自の判定を持たせることで、Patch 1 の影響を file watcher だけに限定する。

**Patch 2 — self-save expected hash で catch-up false positive を根絶 (Root cause A の根本治療)**

R8 を受けて、suppression を「時間ベースの onChanged 抑制」から「期待 hash ベースの self-save 識別」に拡張する。

問題シナリオ (R8): background tab で auto-save → `suppressFileWatch()` 3 秒 → watcher は paused (background) → 3 秒経過 → suppression 期限切れ → tab がアクティブ化されて watcher.start() → catch-up で `mtimeAdvanced=true, isFileSuppressed=false, stale hash` → 誤って `onChanged()` 発火。

解決策:

1. `saveSuppression` Map のエントリを `{ until: number, expectedHash?: string }` に拡張
2. `suppressFileWatch(path, ttlMs?, expectedHash?)` シグネチャ拡張 (既存呼出しと後方互換)
3. `expectedHash` 付き登録は TTL を 60 秒に延長 (auto-save 後の長めの blur/focus 復帰をカバー)
4. `ElectronFileWatcher` の catch-up と `readAndNotify` で、計算した `contentHash` が `expectedHash` と一致したら、suppression 時間切れでも self-save と判定して baseline 更新 + `onChanged()` スキップ
5. `use-auto-save.ts` / manual save 経路で `suppressFileWatch(path, undefined, computedHash)` を呼び出すよう変更
6. `_isActive` ガード追加 (R3)

これにより、suppression 期限とは独立に「ディスクの hash が直近 self-save のものと一致するなら self-save」と判定できる。

設計判断: Patch 1 は focus blur 由来の pause/resume サイクルを減らす「リスク削減」レイヤーとして残す。Patch 2 が完成すれば理論上 Patch 1 は不要だが、二重防御として保持する。実機検証後に Patch 1 撤回可否を判定する。

`WebFileWatcher` の `checkForChanges()` は suppression 分岐の前に `this.lastModified = metadata.lastModified` を更新しており (line 299-306)、`initializeLastModified()` も restart 時に毎回再読みするため、catch-up false positive 経路を持たない (R5 確認済み)。Patch 2 の Electron 専用変更とは別に、Web パスでも expectedHash 比較を入れるかは将来検討。本 PR では Electron に限定する。

**Patch 3 — 縦書き切替で MilkdownEditor を明示的に再マウントする**

`components/Editor.tsx` で MilkdownEditor に `key={isVertical ? "vertical" : "horizontal"}` を付与する。これにより：

- `useEditor` の暗黙の再生成ではなく、React コンポーネント自体が再マウントされる
- `initialContentRef` が最新の `initialContent` prop で再評価される
- `useEditor` の deps から `isVertical` を外して `useMemo` の deps を明示化 (副作用としての二重再生成を防ぐ)

`useEditor` deps からの `isVertical` 削除は、`japaneseNovel({ isVertical })` プラグイン引数とのバインドが新しい key (再マウント) で行われるため、deps に残す必要がない。

### スコープ外

- **Windows 省電力モードハング**: `electron/main.js:213-225` の powerMonitor リスナーや、PR #1439 の lint-worker と相互作用する可能性。本 PR では触らず、別 Issue (`fix(electron): Windows 省電力モード下でメインプロセス無反応`) を起票する。
- **editor lifecycle 全面 refactor**: Issue #1445 で言及。長期 refactor として継続。

## Tech Stack

- TypeScript strict mode
- React 19 (useEffect / useRef / useMemo)
- Milkdown (`@milkdown/utils`, `@milkdown/core`)
- ProseMirror
- Electron IPC for native file watching
- Test: vitest + @testing-library/react

## Files to Touch

| File                                                   | Change                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `lib/editor-page/power-optimization.ts`                | `shouldPauseFileWatchers` を visibility のみで判断するよう変更          |
| `lib/services/file-watcher.ts`                         | `ElectronFileWatcher.readAndNotify()` で suppression 中も baseline 更新 |
| `components/Editor.tsx`                                | `<MilkdownEditor key={isVertical ? "v" : "h"} ... />` を付与            |
| `components/editor/MilkdownEditor.tsx`                 | `useEditor` deps から `isVertical` を削除                               |
| `lib/editor-page/__tests__/power-optimization.test.ts` | `shouldPauseFileWatchers` の新挙動に合わせて更新                        |
| `lib/services/__tests__/file-watcher-catchup.test.ts`  | suppression 中の baseline 更新を検証する新規ケース追加                  |

## Tasks

### Task 1 — Patch 1: file watcher を visibility のみで停止する

**Goal**: focus blur では file watcher を停止しないようにする。

- [ ] `lib/editor-page/power-optimization.ts` の `shouldPauseFileWatchers` を以下に置き換える:
  ```ts
  export function shouldPauseFileWatchers(state: RuntimeActivityState): boolean {
    // ファイル監視は visibility 喪失時のみ停止する。focus blur (Cmd+Tab など) では継続する。
    // Reason: focus blur 後の resume で catch-up logic が auto-save 直後の mtime 進行を
    // 誤って外部変更として扱い、replaceAll() で編集不能になる (#1457 / #1445)
    return !state.isDocumentVisible;
  }
  ```
- [ ] `isBackgroundWindow` は変更しない (他の非クリティカル処理は従来通り focus blur で停止)
- [ ] `getAutoSaveIntervalMs` も変更しない (focus blur での auto-save 間隔延長は副作用が小さい)
- [ ] テスト `lib/editor-page/__tests__/power-optimization.test.ts` に新ケース追加:
  - `shouldPauseFileWatchers({ powerSaveMode: false, isDocumentVisible: true, isWindowFocused: false })` → `false` を期待
  - `shouldPauseFileWatchers({ powerSaveMode: false, isDocumentVisible: false, isWindowFocused: true })` → `true` を期待
- [ ] 検証: `npm run test -- lib/editor-page/__tests__/power-optimization.test.ts`

### Task 2 — Patch 2: self-save expected hash で catch-up false positive 根絶

**Goal**: `saveSuppression` Map に expected hash を持たせ、TTL に依存せず self-save を識別する。`ElectronFileWatcher` の native watch 経路・catch-up 経路の両方で適用。`readAndNotify()` の in-flight 競合は `_isActive` ガードで防ぐ。

#### Step 2.1 — saveSuppression API 拡張 (R8 BLOCKER 修正版)

R8 BLOCKER 対応: hash 不一致 (本物の外部変更) を 60秒間黙って隠蔽してはならない。一方、hash 一致は entry の TTL 内で suppress し続ける。判定を単一の hash-aware 関数に統一する。

- [ ] `lib/services/file-watcher.ts` の `saveSuppression` を以下の型に変更:

  ```ts
  interface SuppressionEntry {
    until: number;
    /** hash 付き = self-save 識別用。未指定 = 旧式 time-only */
    expectedHash?: string;
  }
  const saveSuppression = new Map<string, SuppressionEntry>();

  /** hash 付き suppression の保持期間 (長め、メモリ上限のため終わりはある) */
  const SAVE_SUPPRESSION_WITH_HASH_MS = 5 * 60_000;
  /** 旧式 time-only suppression の TTL */
  const SAVE_SUPPRESSION_MS = 3_000;
  ```

- [ ] `suppressFileWatch()` のシグネチャは後方互換を保つ:
  ```ts
  export function suppressFileWatch(
    filePath: string,
    durationMs?: number,
    expectedHash?: string,
  ): void {
    const ttl = durationMs ?? (expectedHash ? SAVE_SUPPRESSION_WITH_HASH_MS : SAVE_SUPPRESSION_MS);
    saveSuppression.set(filePath, { until: Date.now() + ttl, expectedHash });
  }
  ```
- [ ] 判定関数を **単一の hash-aware** 関数に統一 (R8 完全対応):

  ```ts
  /**
   * 内部用：保留中の suppression entry を期限切れガード付きで取得する。
   */
  function getActiveSuppression(filePath: string): SuppressionEntry | undefined {
    const entry = saveSuppression.get(filePath);
    if (!entry) return undefined;
    if (Date.now() >= entry.until) {
      saveSuppression.delete(filePath);
      return undefined;
    }
    return entry;
  }

  /**
   * 外部変更通知を抑制すべきか判定する。
   * - hash 付き entry: contentHash が expectedHash と一致するときのみ suppress
   *   (一致しないなら本物の外部変更 → 通知すべき、entry は keep して次回 match に備える)
   * - hash 無し entry (legacy): TTL 内なら常に suppress
   *
   * R8: hash 付き entry の TTL 内でも hash 不一致なら通知する。
   * これにより本物の外部変更が黙って隠蔽されることを防ぐ。
   */
  export function shouldSuppressNotification(filePath: string, contentHash: string): boolean {
    const entry = getActiveSuppression(filePath);
    if (!entry) return false;
    if (entry.expectedHash !== undefined) {
      return entry.expectedHash === contentHash;
    }
    return true; // legacy time-only
  }

  /**
   * hash 不要な判定 (legacy time-only や、まだ hash 計算前の用途)。
   * hash 付き entry の場合は **suppress しない** (hash 一致を確認できないため、安全側に倒す)。
   */
  function isFileSuppressedTimeOnly(filePath: string): boolean {
    const entry = getActiveSuppression(filePath);
    if (!entry) return false;
    return entry.expectedHash === undefined;
  }
  ```

  - **重要**: hash 付き entry に対して `isFileSuppressedTimeOnly` は `false` を返す設計。これは「hash があるのに hash 比較していない判定経路」を排除するため。すべての watcher 経路で hash を計算してから `shouldSuppressNotification(path, hash)` を呼ぶ。

- [ ] `cleanupExpiredSuppressions()` を新 entry 型に追従:
  ```ts
  function cleanupExpiredSuppressions(): void {
    const now = Date.now();
    for (const [filePath, entry] of saveSuppression) {
      if (now >= entry.until) {
        saveSuppression.delete(filePath);
      }
    }
  }
  ```

#### Step 2.2 — `readAndNotify()` を hash 認識に変更

- [ ] `lib/services/file-watcher.ts:547-` を以下に変更:

  ```ts
  private async readAndNotify(): Promise<void> {
    try {
      const [content, metadata] = await Promise.all([
        this.vfs.readFile(this.path),
        this.vfs.getFileMetadata(this.path),
      ]);

      // R3: async read 完了までに stop() が呼ばれていれば通知しない
      if (!this._isActive) return;

      const newHash = hashContent(content);

      // baseline は無条件で更新する (R1)
      this.lastKnownModified = metadata.lastModified;

      // hash-aware 判定 (R8): hash 付き entry でも一致しなければ通知する
      if (shouldSuppressNotification(this.path, newHash)) {
        this.lastKnownContentHash = newHash;
        return;
      }

      // 内容変化なしの場合は通知スキップ (既存ロジック)
      if (newHash === this.lastKnownContentHash) {
        return;
      }

      this.lastKnownContentHash = newHash;
      this.onChanged(content, metadata.lastModified);
    } catch (error) {
      // 既存のエラーハンドリングを維持
    }
  }
  ```

#### Step 2.3 — `catchUpAndStartWatcher()` を hash 認識に変更

- [ ] `lib/services/file-watcher.ts:418-486` の catch-up 分岐を以下に変更:

  ```ts
  if (previousModified > 0) {
    const mtimeAdvanced = metadata.lastModified > previousModified;
    const possibleSameSecondChange =
      !mtimeAdvanced &&
      this.pausedAt > previousModified &&
      metadata.lastModified === previousModified;

    if (this._isActive && (mtimeAdvanced || possibleSameSecondChange)) {
      try {
        const content = await this.vfs.readFile(this.path);
        if (!this._isActive) return;
        const contentHash = hashContent(content);

        // baseline は無条件で更新
        this.lastKnownModified = metadata.lastModified;
        const previousHash = this.lastKnownContentHash;
        this.lastKnownContentHash = contentHash;

        // R8: hash 一致なら self-save と判定して通知スキップ。
        // hash 不一致は本物の外部変更なので通知する (entry は keep)。
        if (shouldSuppressNotification(this.path, contentHash)) {
          // self-save、baseline 更新済み、何もしない
        } else {
          const contentChanged = contentHash !== previousHash;
          if (mtimeAdvanced || contentChanged) {
            this.onChanged(content, metadata.lastModified);
          }
        }
      } catch {
        this.lastKnownModified = metadata.lastModified;
      }
    } else {
      this.lastKnownModified = metadata.lastModified;
    }
  }
  ```

#### Step 2.4 — 全 save 呼出し元で expectedHash を渡す (R10 対応)

R10: 現在 `suppressFileWatch()` を呼んでいる 4 箇所に加え、`saveMdiFile()` 経由の save も watcher と相互作用するため、抜け漏れなく hash を登録する必要がある。集中管理アプローチを採用:

- [ ] `hashContent` を `lib/services/file-watcher.ts` から named export
- [ ] **集中管理**: `lib/project/mdi-file.ts:135-` の `saveMdiFile()` 内で、Electron かつ `descriptor.path` がある場合に `suppressFileWatch(path, undefined, hashContent(content))` を呼ぶ。これにより `saveMdiFile()` 経由の全保存が自動的に hash 登録される。
- [ ] 既存の直接呼出し 4 箇所を hash-aware に更新 (これらは `vfs.writeFile()` を直接叩いているため `saveMdiFile()` 集中管理ではカバーされない):
  - [ ] `lib/tab-manager/use-auto-save.ts:97`: `suppressFileWatch(tab.file.path, undefined, hashContent(sanitized))` に変更
  - [ ] `lib/tab-manager/use-close-dialog.ts:89`: 同上
  - [ ] `lib/tab-manager/use-electron-menu-bindings.ts:165`: 同上
  - [ ] `lib/tab-manager/use-file-io.ts:247`: 同上
- [ ] **重要**: `suppressFileWatch()` は `vfs.writeFile()` の **直前** に呼ぶ。逆順 (writeFile → suppress) だと、watcher が write 完了 → change event 検知 → suppress 未登録の状態で `readAndNotify` → false positive となる。現状コードでもこの順序は既に正しい (writeFile 前に suppress) ことを確認済み。
- [ ] `saveMdiFile()` 内部で suppress を登録する場合、関数の引数として `vfs` を受け取り `vfs.writeFile()` する直前で `suppressFileWatch()` を呼ぶ。Electron 判定は `isElectronRenderer()` を用いる。

#### Step 2.5 — テスト (R9 + R11 対応)

R11: 既存 `file-watcher-catchup.test.ts` は top-level で `vi.mock("../../utils/runtime-env", () => ({ isElectronRenderer: () => false }))` しており、`WebFileWatcher` 経路にロックされている。**新規ファイル必須**。

- [ ] `lib/services/__tests__/file-watcher-electron.test.ts` を **新規作成** (既存ファイルに block 追加では NG):

  ```ts
  // isElectronRenderer を true にモック
  vi.mock("../../utils/runtime-env", () => ({ isElectronRenderer: () => true }));

  // watchFile 付き VFS モックを用意
  const watchFileCallbacks = new Map<string, (event: VFSWatchEvent) => void>();
  vi.mock("../../vfs", () => ({
    getVFS: () => ({
      readFile: vi.fn(...),
      getFileMetadata: vi.fn(...),
      writeFile: vi.fn(...),
      watchFile: (path, cb) => {
        watchFileCallbacks.set(path, cb);
        return { stop: () => watchFileCallbacks.delete(path) };
      },
    }),
  }));
  ```

- [ ] 以下の Case を Electron 環境で実装:
  - **Case A (Patch 2 核心)**: auto-save 経由で hash 付き suppress 登録 → native watch change event 発火 → onChanged が呼ばれない、baseline 更新済みであることを検証
  - **Case B (R1+R8)**: watcher start → stop (paused) → 別経路で write & hash 付き suppress 登録 → resume → catch-up が onChanged を呼ばないこと
  - **Case B2 (R8 核心)**: Case B と同様の手順だが、hash 付き entry の TTL **内** で hash 不一致のファイルを resume → onChanged が呼ばれること (本物の外部変更を隠蔽しないことを検証)
  - **Case C (R3)**: `readAndNotify` 中に `stop()` を呼出し (`vfs.readFile` を controllable Promise で deferred) → `_isActive` ガードにより onChanged が呼ばれないことを検証
  - **Case D (回帰)**: hash 不一致 (本物の外部変更) では従来通り onChanged が発火することを検証
- [ ] 検証: `npm run test -- lib/services/__tests__/file-watcher-electron.test.ts lib/services/__tests__/file-watcher-catchup.test.ts`

### Task 3 — Patch 3: 縦書き切替で MilkdownEditor を明示再マウントする

**Goal**: 縦書き ⇔ 横書き切替で MilkdownEditor を React レベルで再マウントし、最新コンテンツで再初期化する。`useEditor` の deps から `isVertical` を外して二重再生成を防ぐ。

Content flow 確認済み (R4): `EditorLayout.tsx:421-425` で `panelContent = liveEditorTab?.content ?? ""` として渡されるため、key 切替による remount でも `initialContent` には最新の buffer (`tab.content`) が flow する。`use-tab-state.ts:311-320` の `setContent()` で編集中の content が逐次反映されている。

安全性確認済み (R7): `verticalScrollPlugin` は `useMemo([])` で一度だけ生成され `isVerticalRef.current` を読むため、`useEditor` deps から `isVertical` を外しても scroll プラグインの正常性に影響しない。`japaneseNovel({ isVertical })` は新しい key の再マウント時に新しい `isVertical` で再構築される。

- [ ] `components/Editor.tsx` の MilkdownEditor 利用箇所 (line 430 周辺) で `key` prop を付与:
  ```tsx
  <MilkdownEditor
    key={isVertical ? "vertical" : "horizontal"}
    isVertical={isVertical}
    initialContent={...}
    ...
  />
  ```
- [ ] `components/editor/MilkdownEditor.tsx` の `useEditor` deps (line 282) から `isVertical` を削除:
  ```ts
  }, [verticalScrollPlugin, mdiExtensionsEnabled, gfmEnabled]);
  ```
- [ ] 同ファイルで `isVertical` を直接読んでいる他の useEffect / レイアウト関連は変更不要 (re-mount で再評価される)
- [ ] 手動 regression test: 大きな MDI ファイルで以下を確認
  - 未保存編集 → 縦↔横切替 → 編集内容が保持されている (R4 関連回帰防止)
  - 縦↔横切替を 5 回連続 → エディタが反応・コンテンツ保持・カーソル動作 OK

### Task 4 — フォロー Issue 起票 (Windows 省電力モード)

**Goal**: スコープ外として切り出した Windows 省電力モードハングのフォロー Issue を作成する。

- [ ] `gh issue create` で以下を作成:
  - Title: `fix(electron): Windows 省電力モード下でメインプロセス無反応 (#1457 から分離)`
  - Labels: `bug`, `P1`
  - Body: #1457 のコメント「省電力モードをオンにすると、プロセス無反応になります (Windows)」を引用し、`electron/main.js:213-225` の powerMonitor リスナーと PR #1439 lint-worker の相互作用を candidate として記載
- [ ] #1457 にコメントで分離 Issue へのリンクを残す

### Task 5 — 統合検証 & commit 分離

- [ ] `npm run type-check`
- [ ] `npm run test`
- [ ] `npm run electron:dev` 起動: ハングしないことを確認
- [ ] 手動 (macOS): エディタ編集中 → Cmd+Tab で別アプリ → 戻る → エディタクリック → カーソル位置維持
- [ ] 手動 (macOS): 未保存編集 → 縦↔横切替 → 編集内容が保持されていること
- [ ] 手動 (macOS): 縦↔横切替を 5 回 → 反応・コンテンツ保持
- [ ] R6 適用: commit を 2 つに分離
  - Commit 1: `fix(file-watcher): prevent false external-change after auto-save & blur/focus cycle (#1457)` (Patch 1 + 2 + テスト)
  - Commit 2: `fix(editor): remount MilkdownEditor on vertical/horizontal toggle (#1457)` (Patch 3)
- [ ] PR description に「Windows 省電力モードは別 Issue で対応」と明記
- [ ] PR description に Patch 1 の Open Question (撤回可否) を Reviewer note として記載

## Review Iteration 1

### Codex feedback summary

1. **R1 (CRITICAL)** — `catchUpAndStartWatcher()` の suppression skip 分岐でも `lastKnownContentHash` を更新しないと次回 resume で hash 比較が誤判定する
2. **R2 (IMPORTANT)** — Patch 1 単独では reproduction が visibility 経路か focus 経路か未検証なので「単独 fix」と扱ってはならない
3. **R3 (IMPORTANT)** — `readAndNotify()` 進行中に `stop()` が呼ばれた場合、async read 完了後に `onChanged()` を呼ぶ競合がある
4. **R4 (SUGGESTION)** — Patch 3 の `initialContent` は `EditorLayout.tsx:421-425` で `panelContent = liveEditorTab?.content ?? ""` 経由で渡されており、最新の buffer が flow するため remount で unsaved edits は失われない (確認済み)
5. **R5 (SUGGESTION)** — `WebFileWatcher` は同等のバグを持たない (line 299-306 で suppression 前に baseline 更新済み)
6. **R6 (SUGGESTION)** — Patch 1+2 と Patch 3 を別 commit に分離すると rollback boundary が明確になる
7. **R7 (SUGGESTION)** — `verticalScrollPlugin` の `useMemo([])` と `isVerticalRef.current` 利用により、`useEditor` deps からの `isVertical` 削除は安全

### Accepted

- **R1**: Task 2 を「`readAndNotify()` だけでなく `catchUpAndStartWatcher()` も baseline 更新する」に拡張。テストケース B を追加
- **R3**: Task 2 の `readAndNotify()` 修正に `_isActive` ガード追加。テストケース C を追加
- **R4**: Architecture section に content flow の確認結果を明記。Task 3 に regression test の手順追加
- **R5**: Patch 2 の説明セクションに `WebFileWatcher` を意図的にスコープ外とした理由を明記
- **R7**: Task 3 の説明文に `verticalScrollPlugin` の安全性を明記

### Partially accepted

- **R2**: Patch 1 を「単独 fix」ではなく「defense-in-depth のリスク削減レイヤー」と位置付けることを Architecture section に明記。ただし Patch 1 を撤回はしない (Patch 2 が根本治療として動けば Patch 1 は不要だが、二重防御として残すことで再発リスクを下げる)。Open Questions に「Patch 1 削除可否は実機検証後に判定」と残す
- **R6**: Issue #1457 は P0 で symptom 1 (編集不能) と symptom 2 (縦書き切替) を両方含むため、1 PR で出すが、commit を `fix(file-watcher): ...` と `fix(editor): vertical toggle ...` の 2 commit に分離する

### Open Questions (post-iteration 1)

- Patch 1 (`shouldPauseFileWatchers` を visibility-only に変更) は Patch 2 が確実に効くなら不要な可能性。実機テスト後に「Patch 1 を撤回して PR #1427 の元の挙動を保つ」選択肢を残す。
- Patch 1 で focus blur 時の file watcher 継続による CPU 増加は測定する価値があるか？ (PR #1427 の元目的が CPU 削減だったため、回帰を最小化する justification として測定値があると良い)

## Review Iteration 2

### Codex feedback summary

1. **R8 (MAJOR)** — 修正後の `catchUpAndStartWatcher` でも suppression 期限切れ後に self-save が初観測される経路で onChanged が誤発火する
2. **R9 (MAJOR)** — 既存 `file-watcher-catchup.test.ts` は `isElectronRenderer: () => false` モックで `WebFileWatcher` 経路しか実行されない

### Accepted

- **R8 (一次対応)**: Patch 2 を「saveSuppression を hash 認識に拡張」する根本的な書き直しに変更 → 後に R8 が BLOCKER に格上げされ、Iteration 3 で完全対応
- **R9**: Task 2 Step 2.5 で Electron-specific test harness を新規作成

## Review Iteration 3

### Codex feedback summary

1. **R8 (BLOCKER 格上げ)** — 二段階の `isOwnSaveByHash() || isFileSuppressed()` 設計には致命的欠陥:
   - `isOwnSaveByHash()` は entry の `until` 期限を超えると `false` を返すため、laptop sleep など 60 秒超のシナリオで false positive が再発
   - `isFileSuppressed()` は hash 付き entry でも TTL 内なら `true` を返すので、その間の本物の外部変更を黙って隠蔽する
2. **R10 (MAJOR)** — `suppressFileWatch` の呼出し元網羅が不完全。`saveMdiFile()` 経由の save がカバーされない
3. **R11 (MINOR)** — 既存 `file-watcher-catchup.test.ts` は top-level で `isElectronRenderer = false` モック済みなので block 追加では Electron 経路に到達できない。新規ファイル必須

### Accepted

- **R8 (BLOCKER)**: Step 2.1 を完全再設計。`shouldSuppressNotification(path, hash)` 単一関数に統一:
  - hash 付き entry: hash 一致時のみ suppress、不一致なら通知 (entry は keep)
  - hash 無し entry (legacy): TTL 内なら常に suppress
  - hash 付き保持期間は 5 分に延長 (メモリ上限のため終わりは持つが、自然な laptop sleep を超える長さ)
- **R10**: Step 2.4 を「`saveMdiFile()` 集中管理 + 既存 4 箇所の直接 `vfs.writeFile()` 呼出しを hash 化」の両建てに変更。`suppressFileWatch()` の呼出し順序 (writeFile 直前) を明記
- **R11**: Step 2.5 を「新規ファイル `file-watcher-electron.test.ts` 必須」に変更、Case B2 (hash 不一致での外部変更通知) を追加

### Rejected

- なし

### Circuit breaker 判定

3 イテレーション目で R8 が BLOCKER に格上げされ、設計の根本見直しを行った。これ以上の Codex レビューは diminishing returns に入る可能性が高いため、本 iteration をもって Codex レビューを終了し、ユーザーに plan を提示する。実機検証 (Task 5) で残った懸念は実装段階で対応する。
