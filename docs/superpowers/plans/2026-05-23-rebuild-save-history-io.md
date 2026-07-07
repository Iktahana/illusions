# 保存・履歴・IO バックエンド再構築計画

- **作成日**: 2026-05-23
- **作業方針**: ローカル `dev` ブランチ上で直接作業（worktree を使わない）。途中経過を実機で確認するためのユーザー指定方針。**作業中は origin/dev へ push しない**。全工程完了後に `feature/rebuild-save-history-io` を切ってそのブランチを push し、PR 化する。
- **設計ベース**: [docs/superpowers/plans/2026-05-06-save-and-history-workflow.md](./2026-05-06-save-and-history-workflow.md)
- **目的**: 保存 / 自動保存 / 履歴 / IO のコードが責務混在で肥大化しているため、関連実装を順に全削除した上で、2026-05-06 計画をベースにゼロから再構築する。

---

## 1. スコープ確定（削除対象 / 保持対象）

### 1.1 削除対象（順次）

| #   | 系統            | 主な対象                                                                                                                                                                                                                                                                                      | 備考                                                                             |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Auto-save       | `lib/tab-manager/use-auto-save.ts`、`AUTO_SAVE_INTERVAL` (`types.ts:97`)、`lib/editor-page/power-optimization.ts` の auto-save throttle 部分、関連テスト                                                                                                                                      | 入口・経路ともに削除                                                             |
| 2   | Save            | `use-file-io.ts` の `saveFile` / `saveAsFile` / `tryAutoSnapshot`、`use-electron-menu-bindings.ts` の save ハンドラ、`use-close-dialog.ts` の save 経路、IPC `save-file` / `save-before-close-done` / `menu-save-triggered` / `menu-save-as-triggered` / `electron-request-save-before-close` | UI 側のフック（`useSaveToast` / `useUnsavedWarning`）は残してロジックを no-op に |
| 3   | Load            | `use-file-io.ts` の `openFile` / `openFolder` / `openProject`、IPC `open-file` / `open-folder`、`lib/editor-page/use-file-opening.ts` の読込パイプライン                                                                                                                                      | ダイアログ起動の UI 側は残すが、読み込み実装は丸ごと削除                         |
| 4   | IO (VFS)        | `lib/vfs/` 配下全削除（`electron-vfs.ts` / `web-vfs.ts` / `path-utils.ts` / `types.ts` / `index.ts`、テスト一式）、electron/main 側で `fs.read*` / `fs.write*` する IPC handler                                                                                                               | プロジェクトファイル IO 抽象そのものを廃止                                       |
| 5   | History backend | `lib/services/history-service.ts`、`lib/services/__tests__/history-service.test.ts`、`file-watch-integration.test.ts`、IPC `history:lock:acquire` / `history:lock:release`、`components/HistoryPanel/snapshot-utils.ts`、`lib/editor-page/use-previous-day-stats.ts`（history 依存部分）      | `HistoryPanel.tsx` / `SnapshotItem.tsx` は UI シェルとして空状態描画に書き換え   |

### 1.2 保持対象（範囲外）

- `lib/storage/` 全般（`storage-service.ts` / `platform/electron-renderer/storage.ts` / `platform/browser/storage.ts` / `app-state-manager.ts` / `local-preferences.ts`）  
  → 最近開いたファイル・ユーザー辞書・キーマップ・dockview レイアウト・無視リスト等で利用中。**削除しない**。
  - ただし「StorageService の `saveSession` / `saveAppState` / `saveEditorBuffer`」はユーザーが指す「保存」ではない（セッション・アプリ状態のメタ永続化）ため、本リファクタの「保存削除」スコープからは **除外**。命名が紛らわしいため計画中に都度明示する。
- `components/HistoryPanel.tsx`、`components/HistoryPanel/SnapshotItem.tsx`、`useSaveToast`、`useUnsavedWarning`  
  → UI 側のシェル / フックは残置。backend 接続を no-op スタブに差し替える。

---

## 2. 削除フェーズ（順序付き）

> 1 ブランチ完結方針のため、フェーズはコミット粒度の指針。途中でビルドが壊れる前提。最後の Phase 6 で「壊れたまま起動可」状態まで戻す。

### Phase 0: 準備

- ローカル `dev` ブランチで作業する（worktree 不使用）。`git status` で clean、`git log dev..origin/dev` / `git log origin/dev..dev` で同期確認
- baseline: `npm run type-check`、`npm test` 実行、グリーン確認
- **ローカル安全バックアップ作成**（push しないローカル専用ブランチ）:
  - `git branch backup/pre-rebuild-save-history-2026-05-23` ← 破壊フェーズに入る前の dev HEAD を保存
  - リカバリは `git reset --hard backup/pre-rebuild-save-history-2026-05-23` で可能
- 本計画書はローカル dev に置いておき、最終 push 時にまとめて feature ブランチへ載せる
- **作業中は origin/dev へ push しない**（誤 push を避けるため最初に確認）

### Phase 1: Auto-save 削除

- 削除: `lib/tab-manager/use-auto-save.ts` の **実装本体**、`lib/tab-manager/__tests__/auto-save-sync-status.test.ts`
- **shim 残置**: `lib/tab-manager/use-auto-save.ts` を no-op フック（同じ signature の空関数）に書き換える。`lib/tab-manager/index.ts:6` の export が type-check で壊れないように維持する。Phase 8 で本実装に書き換え。
- 削除: `lib/tab-manager/types.ts` の `AUTO_SAVE_INTERVAL` 定数（型は Phase 8 で再定義）
- 削除: `lib/editor-page/power-optimization.ts` の auto-save throttle（他の power 機能は維持）
- 一時無効化: `app/page.tsx` の `getAutoSaveIntervalMs()` 経路を 0 / null 等の安全値に置換

### Phase 2: Save 削除

- 削除: `use-file-io.ts` の `saveFile` / `saveAsFile` / `tryAutoSnapshot` の **実装本体**（参照側を壊さないよう、関数は no-op shim として残置し Phase 8 で再実装）
- 削除: `use-electron-menu-bindings.ts` の save 経路（reload 系は別途検討）
- 削除: `use-close-dialog.ts` の save 経路
- **close-handshake の取り扱い（R4 反映）**:
  - `electron-request-save-before-close` と `electron-request-flush-state-before-close` の 2 系統が存在（`electron/window-manager.js:116, 119, 130`）
  - 後者（flush）は保存以外（dockview レイアウト、editor buffer 等の StorageService 永続化）にも使われるため **残置**。前者（save before close）と `saveDoneAndClose` のみ削除し、close フローが dead-end しないよう main 側で no-op handler を一時残置するか、renderer 側で常に "Don't save" 相当の即座 close 応答を返す
- 削除: `electron/preload.js` の save 系 API（`saveFile`、`saveDoneAndClose`、`onMenuSave*`、`onElectronRequestSaveBeforeClose`）— `onElectronRequestFlushStateBeforeClose` は残置
- 削除: `electron/ipc/file-ipc.js:294` の `save-file` IPC handler、`menu-save-triggered` / `menu-save-as-triggered` menu アクション
- 残置: `useSaveToast` / `useUnsavedWarning` は呼び口だけ残し、実装は no-op で返す

### Phase 3: Load 削除（R3 反映で実態に合わせて書き直し）

- 削除: `lib/tab-manager/use-file-io.ts` の `openFile` / `openProjectFile` 等の読込ロジック（実態は `openFolder` / `openProject` ではなくこの 2 つ）
- 削除: `lib/editor-page/use-file-opening.ts` の `handleOpenProject` / `handleOpenStandaloneFile` / `handleOpenRecentProject` / `handleOpenAsProject` / `openRestoredProject` の本体（参照側を壊さないよう no-op shim を残置）
- 削除: `lib/project/project-service.ts` の `openProject` 等プロジェクト・オープン経路（VFS 依存のため Phase 4 と連動）
- 削除: `electron/ipc/file-ipc.js:276` の `open-file` IPC handler、`get-pending-file`（同 `:638`）、関連の `open-file-from-system` / `open-as-project` の handler 一式
- 削除: `electron/preload.js` の `openFile`、`getPendingFile` 等（注: `loadSession` / `loadAppState` / `loadEditorBuffer` は §1.2 通り **残置**）
- 削除: `electron/menu.js:180` 前後の `menu-open-project` / `menu-open-recent-project` / `menu-open-triggered` 送出と対応 handler

### Phase 4: IO (VFS) 削除（R1, R2 反映で shim 戦略へ変更）

- **物理削除ではなく実装空洞化 + 型 shim 残置**: type-check を維持するため `lib/vfs/` ディレクトリ自体は残し、`electron-vfs.ts` / `web-vfs.ts` / `index.ts` の **実装を no-op に置換**。`types.ts` / `path-utils.ts` の型・ユーティリティは残置（多数の caller が type import している `types/electron.d.ts:10` 等を維持）。Phase 7 で新 IO 抽象へ置換、その時点で物理削除可能か再判定。
- 削除: `electron/ipc/vfs-ipc.js` 配下の `vfs:open-directory` / `vfs:read-file` / `vfs:write-file` / `vfs:read-directory` / `vfs:stat` / `vfs:mkdir` / `vfs:delete` / `vfs:rename` / `vfs:set-root` IPC handler。`vfs:index-lock:*` は Phase 5 で削除。
- 削除: `electron/preload.js` の対応 API
- **保存系外で VFS に依存しているモジュールの停止対応**（実装を no-op に置換し、UI から呼び出されても安全に動かない）:
  - `lib/services/file-watcher.ts`
  - `lib/project/project-service.ts`、`lib/project/workspace-persistence.ts`
  - `lib/services/user-dictionary-service.ts`
  - `lib/services/ignored-corrections-service.ts`
  - `components/WordFrequency.tsx`
  - `lib/tab-manager/use-tab-persistence.ts` の VFS 参照部分
  - `lib/editor-page/project-file-utils.ts`、`use-electron-events.ts`
- **起動経路のスタブ化（R1 反映）**: 以下は app 起動直後やプロジェクト復元時に VFS を叩くため、Phase 6 でアプリ起動可にするには事前にガード/スタブが必要:
  - `lib/editor-page/use-project-lifecycle.ts:170` — 起動時の自動プロジェクト復元
  - `lib/editor-page/use-file-opening.ts:69` — 起動直後の pending file open
  - `lib/project/project-service.ts:123` — openProject 経路
  - `components/explorer/FilesPanel.tsx:61` — ファイルツリー読み込み
    対応: 各エントリで `if (!vfs.isAvailable())` 早期 return もしくはモジュール側 no-op、UI は空状態で描画

### Phase 5: History backend 削除（R5 反映で IPC 名を訂正）

- 削除: `lib/services/history-service.ts` の **実装本体**（型 export を切り出すか、`HistorySnapshot` 等の型は `components/HistoryPanel.tsx:6` / `SnapshotItem.tsx:7` 維持のため一時 shim として残す）、`history-service.test.ts`、`file-watch-integration.test.ts`
- 削除: 実態の cross-window history lock IPC `vfs:index-lock:acquire` / `vfs:index-lock:release`（`electron/preload.js:205`、`electron/ipc/vfs-ipc.js:402, 422`）— Phase 4 ではなくここで削除（命名は `vfs:` だが意味的に history lock のため）
- 削除: `components/HistoryPanel/snapshot-utils.ts`
- 書き換え: `components/HistoryPanel.tsx` を空状態 UI シェルへ（snapshot 一覧 props を `[]` 固定、`onRestore` を no-op、`SnapshotItem.tsx` は型だけ残す）
- 書き換え: `lib/editor-page/use-previous-day-stats.ts` の history 依存箇所（`getHistoryService` / `getSnapshots` / `getSnapshotContent` を呼んでいる箇所、`:4` と `:83`）を no-op もしくは関数ごと削除

### Phase 6: 中間ビルド確認（壊れたまま起動可へ）

- `app/page.tsx` の壊れた参照（`saveFile` / `saveAsFile` / `openFile` / 履歴系 props 等）を、引数だけ受けて何もしない関数 / 空配列で埋める
- **type-check を維持できる根拠（R2 反映）**: Phase 1-5 で実装空洞化された各モジュール（`lib/vfs/*`、`use-auto-save`、`history-service` の型 shim、`use-file-io` shim、`useFileOpening` shim）は **型 surface を維持しているため**、`lib/tab-manager/index.ts:6`、`types/electron.d.ts:10`、`lib/editor-page/project-file-utils.ts:4`、`components/HistoryPanel.tsx:6`、`SnapshotItem.tsx:7` の import がすべて解決する
- `npm run type-check` グリーン、`npm test` で削除済みテストの参照漏れがないこと、`npm run dev` でアプリ起動
- 期待される機能不全: ファイル開閉・保存・履歴・外部変更検知・辞書・無視リスト・WordFrequency 等が動かないこと（**仕様通り**）
- ここで一度コミット境界を切ってレビュアー向けの可視ポイントを残す（コミットメッセージで「delete-only milestone」と明示）

---

## 3. VFS 削除の波及まとめ

VFS は保存・履歴と切り分けて使われている領域も多い。Phase 4 で **計画的に止める**サービス一覧と、Phase 7 で配線し直す優先度を以下に整理する。

| モジュール                                        | 停止中の影響                                      | 再配線優先度     |
| ------------------------------------------------- | ------------------------------------------------- | ---------------- |
| `file-watcher.ts`                                 | 外部変更検知が無効                                | 中（保存と密接） |
| `project-service.ts` / `workspace-persistence.ts` | プロジェクト構造の永続化が無効                    | 高（保存の前提） |
| `user-dictionary-service.ts`                      | ユーザー辞書が読めない                            | 中（リント影響） |
| `ignored-corrections-service.ts`                  | 無視リストが読めない                              | 低               |
| `WordFrequency.tsx`                               | 語彙統計が動かない                                | 低               |
| `use-tab-persistence.ts` の VFS 部分              | タブ復元の一部が無効（StorageService 部分は維持） | 中               |
| `use-project-lifecycle.ts:170`                    | 起動時の自動プロジェクト復元が無効（白紙起動）    | 高（UX 影響）    |
| `FilesPanel.tsx:61`                               | ファイルツリーが空状態描画                        | 中               |
| `use-file-opening.ts:69` の pending file open     | 起動直後の引数ファイル open が無効                | 中               |

---

## 4. 再構築フェーズ（出発点）

### Phase 7: 新 IO 抽象の設計 / 実装

2026-05-06 計画には VFS 削除の論点がないため、本リファクタ固有の補完項目。

- 設計骨子（叩き台）:
  - **ProjectFileService**: プロジェクトディレクトリ配下のファイル read/write のみを担う薄い層。**Electron は main プロセス経由必須**（renderer から直接 `fs` を呼ばない）、Web は OPFS or IndexedDB
  - **AppDataService**: StorageService（既存）を経由する設定・メタデータの読み書き
  - VFS が一手に担っていた責務を「プロジェクト内ファイル IO」と「設定・履歴永続化」に 2 分割
- 2026-05-06 計画 §2.1 の 2 原則（プロジェクト系 → ディスク / 設定系 → DB）と完全一致させる

#### Phase 7 で必ず維持するセキュリティ不変条件（R6 反映）

新 IO 抽象は **既存の renderer-to-main セキュリティ境界を弱めてはならない**。具体的に維持する不変条件:

1. **main プロセス仲介**: renderer 由来のファイル IO はすべて IPC handler 経由で main プロセスを通過する（`contextIsolation: true` / `nodeIntegration: false` 維持、CLAUDE.md §5）
2. **ダイアログによる明示承認**: プロジェクトルート設定はネイティブダイアログでユーザー承認を経た path のみを受け付ける（既存 `electron/ipc/file-ipc.js:126` / `electron/ipc/vfs-ipc.js:305` の挙動を踏襲）
3. **ルート確認（root scoping）**: 設定済みプロジェクトルート配下以外への読み書きを拒否
4. **path traversal 拒否**: `..` を含む path、絶対 path、シンボリックリンク経由の root 脱出を拒否
5. **sensitive path 拒否**: `.env`、`~/.ssh`、`/etc` 等のシステム/秘匿ディレクトリ拒否（既存実装の denied-path リストを移植）

これらを欠くと OWASP A01:2021 (Broken Access Control) / A03:2021 (Injection - Path Traversal) を導入するため、設計レビュー時に必ずチェックリストとして使う。

### Phase 8: 保存・履歴の再設計実装

2026-05-06 計画に従う。主な要件のみ列挙：

- §2.2: 保存と履歴を **イベント駆動**で疎結合に
- §3.1: 自動保存トリガー（前景 5s / 背景 20s / アプリ終了 / 外部 reload 前 snapshot）
- §3.2-3.3: 保存種別 `auto` / `manual` を明示し、`tryAutoSnapshot` のハードコード問題（B1）を構造的に解消
- §3 G3: restore 前の snapshot 自動取得
- §3 G5/G6: 保存失敗時の dirty 維持、auto-save 失敗の永続表示
- §2.1 系: 履歴は **Project mode のみ**有効、Standalone では生成しない

### Phase 9: VFS 依存（非保存系）の再配線

- `file-watcher`, `project-service`, `workspace-persistence`, `user-dictionary`, `ignored-corrections`, `WordFrequency`, `use-tab-persistence` の VFS 部分を新 IO 抽象へ移行
- ユニットテストを順次復活

### Phase 10: ブランチ化・マージ準備

- type-check / test / build すべてグリーン
- ローカル dev で `git fetch origin && git rebase origin/dev` 衝突解消
- ローカル dev の HEAD から feature ブランチを切り出す:
  - `git checkout -b feature/rebuild-save-history-io`
  - `git push -u origin feature/rebuild-save-history-io`
- ローカル dev を origin/dev に揃え直す（**作業中の dev は origin/dev に push しないため、push 後にローカル dev をクリーン化**）:
  - `git checkout dev && git reset --hard origin/dev`
- safety branch を維持（`backup/pre-rebuild-save-history-2026-05-23`）— PR マージ後しばらく削除しない
- feature ブランチで PR 作成（巨大 PR になる前提で、レビュアー向けにコミット粒度を整理）

#### マージ時に close する関連 issue（新規ユーザー要求反映）

PR description の本文末尾に以下を含めて、GitHub の自動 close を起動する:

```
Closes #1432  整理: lib/tab-manager の保存系フローを共通化
Closes #1438  整理: HistoryService をポリシー層と永続化層に分解
Closes #1448  整理: editor lifecycle / file watcher / window activity / external reload の責務分離
Closes #1435  整理: file-ipc.js と vfs-ipc.js のパス安全性ヘルパー共通化（Phase 7 で吸収）

Refs #1450    epic: バックエンド全面リファクタ（umbrella、close しない）
Refs #1466    再実装: power-aware throttling（Phase 1 で停止、Phase 8 で再導入）
```

- マージ前に各 issue を再確認し、本 PR で実際に解消されていない項目は close 対象から外す（Refs に降格）
- #1450（epic）は umbrella なので close しない、参照のみ
- #1466 は power-aware throttling の再実装。Phase 8 で auto-save 再構築時に取り込めるが、別 issue として残す方が追跡しやすければ Refs のまま

- リリースタイミングは weekly Monday release より外す調整（merge freeze 期との競合確認）

---

## 5. 検証シナリオ（再構築後）

- Project mode: 新規 → 編集 → Cmd+S → 履歴 1 件生成 → 復元 → 復元前 snapshot が自動生成されている
- Standalone mode: 新規 → 編集 → Cmd+S → 履歴は生成されない（仕様）
- Auto-save: 前景 5s / 背景 20s の interval が動作
- 外部編集 reload: ユーザーが reload 選択 → reload 前に snapshot
- 失敗系: 保存失敗で dirty 維持、auto-save 失敗が UI に永続表示
- StorageService 経由: 最近ファイル / 辞書 / キーマップ / dockview が引き続き動作（リファクタの影響を受けないこと）

---

## 6. リスクと注意

- **巨大 PR**: 削除 + 再構築を 1 ブランチで完結させるため、最終 PR の差分は膨大になる。レビュー困難を承知のうえで、Phase 6 / Phase 8 / Phase 9 をコミット境界として明示する。
- **ローカル dev 直接作業のリスク**: worktree を使わないためメインの作業ディレクトリが長期間「壊れた dev」状態になる。作業中は他タスクへの切替が困難。誤って origin/dev に push しないよう、各コミット後に `git status` / `git log origin/dev..dev` で確認する。完成時にローカル dev を `git reset --hard origin/dev` で戻す段取りを Phase 10 に明記済み。
- **VFS 削除中の他機能停止**: 保存系外のモジュール（辞書・file-watcher 等）も停止する期間が生じる。dev に取り込むタイミングは weekly release 直後を選び、release freeze に触れないようにする。
- **StorageService 命名の混同**: `saveAppState` 等は名前に「save」を含むが削除対象ではない。コミットメッセージや PR 説明で都度明示する。
- **履歴は project mode 限定**: 2026-05-06 §2.1 の系を踏襲。standalone で履歴が「消えた」ように見えるが仕様。
- **テスト消滅**: 削除フェーズで多数のテストが消える。Phase 8/9 で新規テストを書くまでカバレッジが一時的に低下する。

---

## 7. オープンクエスチョン

- Phase 7 の新 IO 抽象（ProjectFileService / AppDataService）の詳細設計は本計画では未確定。Phase 6 完了後に別途設計ドキュメントを起こす。
- Web 版（Next.js のみ）でのプロジェクトファイル IO 戦略（OPFS or IndexedDB or 既存 web-vfs 相当の再設計）は別途要決定。
- リリース戦略（feature flag で旧経路と並走させるか、ストレートに置き換えるか）は要相談。本計画は「並走なしのストレート置き換え」前提。

---

## 8. レビュー反映ログ

### Review Iteration 1（Codex、2026-05-23）

#### Accepted

- **R1 (CRITICAL)**: VFS 影響範囲に startup 経路（`use-project-lifecycle`、`use-file-opening` pending file、`FilesPanel`、`project-service.openProject`）を追加。Phase 4 にスタブ化指示を追記、§3 影響表に追加 3 行
- **R2 (CRITICAL)**: 物理削除ではなく **実装空洞化 + 型 shim 残置** 戦略に転換。Phase 1（use-auto-save）、Phase 2（use-file-io save 系）、Phase 3（use-file-opening）、Phase 4（lib/vfs/）、Phase 5（history-service 型）すべて shim 戦略へ変更。Phase 6 に type-check 維持の根拠を明記
- **R3 (IMPORTANT)**: Phase 3 を実態の entrypoint 名（`openFile` / `openProjectFile` / `handleOpenProject` / `handleOpenRecentProject` / `handleOpenAsProject` / `openRestoredProject`）と IPC 名（`open-file` / `get-pending-file` / `open-file-from-system` / `open-as-project`、menu は `menu-open-project` / `menu-open-recent-project` / `menu-open-triggered`）に書き直し
- **R4 (IMPORTANT)**: Phase 2 に close-handshake 2 系統（`electron-request-save-before-close` 削除、`electron-request-flush-state-before-close` 残置）を明示。close フローが dead-end しないよう main 側 no-op handler の暫定残置を指示
- **R5 (IMPORTANT)**: history lock IPC を実態の `vfs:index-lock:acquire` / `vfs:index-lock:release` に訂正（誤って `history:lock:*` と書いていた）。削除フェーズも Phase 4 ではなく Phase 5 に整理
- **R6 (IMPORTANT)**: Phase 7 にセキュリティ不変条件 5 項目（main 仲介 / ダイアログ承認 / root scoping / path traversal 拒否 / sensitive path 拒否）を追加。OWASP A01/A03 参照
- **R7 (IMPORTANT)**: Phase 0 にローカル安全バックアップ `backup/pre-rebuild-save-history-2026-05-23` を追加。Phase 10 でも safety branch をマージ後しばらく残すよう明記。ユーザー指定の「dev 直接作業」方針は維持

#### Rejected

- なし（全件 accept）

#### Partially Accepted

- なし

#### 並行追加（ユーザー新規要求）

- Phase 10 に「PR マージ時に関連 issues を自動 close」のステップ追加。`Closes #1432 #1438 #1448 #1435`、`Refs #1450 (epic) #1466 (power throttle 再導入は別 issue 維持)`
