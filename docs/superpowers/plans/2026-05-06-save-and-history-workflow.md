# 自動保存 + 履歴保存 ワークフロー設計

- **作成日**: 2026-05-06
- **対象**: illusions（Electron + Next.js + Milkdown）
- **ステータス**: Phase 3 ユーザーレビュー反映済み（Codex peer-review 待ち）
- **背景 Issue**: ユーザー報告「自動保存タイミングが論理に合わない」「保存時に snapshot が取られない」「手動保存で `manual` 種別が必要」
- **関連 PR**: #1425（空段落）, #1427（power-aware throttling）, #1439（lint worker）
- **関連リファクタ Issue**: #1432（tab-manager 保存系共通化）, #1438（HistoryService をポリシー / 永続化に分解）

---

## 1. 現状（Phase 1 fact-finding 結果）

### 1.1 自動保存

| 項目                  | 現状                                            | 出典                                                      |
| --------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| Interval（前景）      | **5 秒**                                        | `lib/tab-manager/types.ts:97` `AUTO_SAVE_INTERVAL = 5000` |
| Interval（背景）      | **20 秒**（throttle）                           | `lib/editor-page/power-optimization.ts:12`                |
| 動的選択              | runtime activity に応じて切替                   | `app/page.tsx:234` `getAutoSaveIntervalMs()`              |
| ループ実装            | `setInterval` で全 dirty タブをポーリング       | `lib/tab-manager/use-auto-save.ts:72-157`                 |
| Standalone vs Project | 分岐あり、両方とも保存自体は走る                | `use-auto-save.ts:95-98 / 116-142`                        |
| pause 条件            | `isBackgroundWindow()` で file watcher 一時停止 | `power-optimization.ts:40-41`                             |

### 1.2 通常保存（Cmd+S / メニュー / ボタン）

| 入口              | 経路                                                         | 出典                                    |
| ----------------- | ------------------------------------------------------------ | --------------------------------------- |
| Cmd+S             | `use-keyboard-shortcuts.ts:152` `"file.save"` → `saveFile()` | 同上                                    |
| Electron メニュー | `onMenuSave` → `saveFileRef.current()`                       | `use-electron-menu-bindings.ts:257-264` |
| Save As           | `use-file-io.ts:342-402`、descriptor=null でダイアログ       | 同上                                    |
| Project 保存      | `vfs.writeFile` → `tryAutoSnapshot(..., !isAutoSave)`        | `use-file-io.ts:245-280`                |
| Standalone 保存   | `saveMdiFile()` IPC → `tryAutoSnapshot(..., !isAutoSave)`    | `use-file-io.ts:283-317`                |

### 1.3 履歴（HistoryService）

| 項目            | 現状                                     | 出典                         |
| --------------- | ---------------------------------------- | ---------------------------- |
| Snapshot 種別   | `"auto" \| "manual" \| "milestone"`      | `history-service.ts:53`      |
| Throttle        | 5 分（`AUTO_SNAPSHOT_INTERVAL_MS`）      | `history-service.ts:25`      |
| Retention       | 100 件 / 90 日（milestone 除外）         | `history-service.ts:19,22`   |
| Per-file 上限   | 100 件（auto のみ削減）                  | `history-service.ts:34`      |
| Pruning trigger | `createSnapshot` 内のみ                  | `history-service.ts:354-355` |
| 永続化          | VFS `.illusions/history/` + `index.json` | `history-service.ts:822-846` |
| Lock            | AsyncMutex + Electron IPC lock           | `history-service.ts:798-802` |

### 1.4 確定バグ・設計穴

| ID     | 内容                                                                                                 | 影響                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **B1** | `tryAutoSnapshot` が `forceSnapshot=true` でも `type: "auto"` をハードコード（`use-file-io.ts:138`） | **手動保存しても `manual` 種別の履歴が一度も作られない**。UI の「手動保存」バッジは押下時しか出ない |
| **B2** | CLAUDE.md の「30 秒」記載と実装（5 秒）が不整合                                                      | ドキュメント drift                                                                                  |
| **B3** | 手動保存と auto-save の責務が同じ関数 `tryAutoSnapshot` に詰め込まれており、種別判定ができない構造   | B1 の根本原因。リファクタ必要（#1432）                                                              |
| **G2** | 外部ファイル reload 前の snapshot 未実装（`use-electron-menu-bindings.ts:223-251` は reload のみ）   | 外部編集ですり替わると編集前内容が消える                                                            |
| **G3** | 復元（restore）時に **戻す前** の snapshot を取らない（`history-service.ts:376` `restoreSnapshot`）  | 履歴 → 復元 → 「やっぱり戻したい」が不可能                                                          |
| **G4** | `milestone` 種別はテストのみ、コード側に作成経路なし（**別 issue**）                                 | 仕様未完だが本スコープ外                                                                            |
| **G5** | 保存失敗時、`isSaving=false` のみでリトライ・dirty 維持が暗黙（`use-file-io.ts:318-323`）            | データロス可能性                                                                                    |
| **G6** | Auto-save 失敗は warning toast のみ、UI に永続表示なし（`use-auto-save.ts:146-149`）                 | ユーザーが失敗に気付けない                                                                          |

> **元 G1（Standalone mode で履歴無効）はギャップではなく仕様**として再確定（§2.1 参照）。

---

## 2. 設計目標とアーキテクチャ原則

### 2.1 アーキテクチャ原則（最重要・Phase 3 確定）

> **2 つの原則**
>
> 1. **プロジェクトに関わるデータ → ディスク**（`.illusions/` 配下、VFS 経由で永続化）
> 2. **ユーザー設定に関わるデータ → データベース**（`getStorageService()`、SQLite / IndexedDB）

履歴（snapshot + index）はプロジェクトに紐付くデータなので **必ずディスク**。ユーザー preferences（`restore-point` の自動生成 ON/OFF など）は DB。

> **系（corollary）**：履歴機能は **Project mode のみ**有効。Standalone（単一ファイル編集）は履歴非対応とする。理由：単一ファイル編集には通常履歴需要がなく、ディスク上の保存先を一意に決められない（編集ファイルの隣？ユーザー home？）ため、原則 1 を綺麗に満たせない。

### 2.2 設計目標

1. **保存と履歴の責務を分離**：保存は永続化、履歴は時系列スナップショット。両者は **イベント駆動**で連動（同期呼び出しで密結合しない）
2. **保存操作 → 種別 → snapshot の対応表を一意に決める**（連動マトリクス §3.3）
3. **失敗フェイルセーフ**：保存失敗で dirty 維持、auto-save 失敗の永続表示、snapshot 失敗は保存をブロックしない
4. **既存 `HistoryService` public API 後方互換**（#1438 リファクタは後続で）

---

## 3. ワークフロー仕様

### 3.1 自動保存

#### 3.1.1 トリガー（最終仕様）

| トリガー                            | 条件                                            | 動作                                                               |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| **Interval (active)**               | 前景 + dirty tab あり                           | 5 秒ごとに全 dirty tab を順次保存（既存維持）                      |
| **Interval (background)**           | `isBackgroundWindow()`                          | 20 秒ごとに全 dirty tab を順次保存（既存 PR #1427 維持）           |
| **App quit / Window close**         | （既存）`use-electron-menu-bindings.ts:111-190` | 全 dirty tab を保存、失敗で close をキャンセル                     |
| **External reload prompt 確認直前** | （新規）外部変更検知でユーザーがリロード選択    | リロード前に snapshot 取得（保存はしない、現メモリ内容を残すのみ） |

> **採用しないトリガー**（Phase 3 確定）：
>
> - Window blur での即時保存 — interval だけで十分との判断
> - Tab switch での即時保存 — interval だけで十分との判断

> **除外条件**：`fileSyncStatus === "conflicted"` のタブは auto-save 対象外（既存仕様維持、`use-file-io.ts:231`）

#### 3.1.2 保存先

- **Project mode**：VFS 直接書き込み + `suppressFileWatch()`（既存維持）
- **Standalone mode**：IPC 経由（Electron）または Web File API（既存維持）
- **Editor buffer**（dirty 内容のクラッシュ復旧用）：30 秒ごとに `getStorageService().saveEditorBuffer()`（CLAUDE.md 第 6 章既述、既存維持）

#### 3.1.3 失敗時挙動

- 保存失敗 → `isDirty: true` を維持、`isSaving: false`、エラー toast、**1 回のみリトライ**（次の interval tick）、それでも失敗なら status bar に「⚠ 保存失敗」永続バッジ（**新規 UI**）
- snapshot 失敗 → 保存自体は成功扱い、`console.warn` のみ（既存維持）

### 3.2 履歴保存（snapshot）— Project mode のみ

#### 3.2.1 種別の再定義

| 種別                  | 用途                                      | retention                              | UI バッジ                         |
| --------------------- | ----------------------------------------- | -------------------------------------- | --------------------------------- |
| `manual`              | 手動保存（Cmd+S / 保存ボタン / メニュー） | **永久保存**（件数・期間ともに無制限） | 青「手動保存」                    |
| `auto`                | 自動保存ループ                            | 100 件 / 90 日（既存）                 | グレー「自動保存」                |
| `pre-close`           | タブ閉じる前 / window 終了前              | **永久保存**（件数・期間ともに無制限） | 黄「終了前」                      |
| `pre-external-reload` | 外部変更で reload する直前                | 30 件 / 30 日（**新規**）              | 橙「外部変更前」                  |
| `restore-point`       | 履歴復元する直前の現状                    | 30 件 / 30 日（**新規**）              | 紫「復元前」                      |
| `milestone`           | UI から明示的にラベル付き作成             | 永久（既存、別 issue でスコープ外）    | アクセント「マイルストーン」+ Pin |

> 既存の `SnapshotType = "auto" | "manual" | "milestone"` を **拡張**：`"pre-close" | "pre-external-reload" | "restore-point"` を追加。後方互換性は index.json の `type` 文字列がそのまま保存されるため、既存データは無修正で動作。

#### 3.2.2 throttle ポリシー

| 種別                                                | throttle             | 理由                                 |
| --------------------------------------------------- | -------------------- | ------------------------------------ |
| `manual`                                            | **なし**（毎回作成） | ユーザー操作は意図的、必ず痕跡を残す |
| `auto`                                              | 5 分（既存）         | 連続 auto-save での無限増殖防止      |
| `pre-close`, `pre-external-reload`, `restore-point` | なし                 | 一度きりの critical 操作             |
| `milestone`                                         | なし                 | UI 明示操作                          |

#### 3.2.3 retention rule

`HistoryIndex` を拡張：

```typescript
interface HistoryIndex {
  snapshots: SnapshotEntry[];
  retention: {
    manual: { maxCount: null; maxAgeDays: null }; // 永久（Phase 3 確定）
    auto: { maxCount: 100; maxAgeDays: 90 }; // 既存
    "pre-close": { maxCount: null; maxAgeDays: null }; // 永久（Phase 3 確定）
    "pre-external-reload": { maxCount: 30; maxAgeDays: 30 };
    "restore-point": { maxCount: 30; maxAgeDays: 30 };
    milestone: { maxCount: null; maxAgeDays: null }; // 既存
  };
}
```

旧フィールド `maxSnapshots`, `retentionDays` は **legacy** として残し、index 読み込み時に `retention.auto` にマップ（後方互換）。

> **永久保存される種別が 3 つ**（`manual`, `pre-close`, `milestone`）。これらは件数の自然増を許容する設計。代わりに UI から手動削除を可能にする（既存 `deleteSnapshot` API）。

### 3.3 保存 ↔ 履歴 連動マトリクス（最重要）

| ユーザー操作                           | 保存実行 | snapshot 種別                    | force               | 備考                                                |
| -------------------------------------- | -------- | -------------------------------- | ------------------- | --------------------------------------------------- |
| **Cmd+S / 保存ボタン / メニュー Save** | ✅       | `manual`                         | ✅                  | **B1 修正**：必ず作成                               |
| **Save As**（新規パスへ保存）          | ✅       | `manual`                         | ✅                  | 旧パスでの最後の状態は別途残らない（仕様）          |
| **Auto-save (interval)**               | ✅       | `auto`                           | ❌（5 分 throttle） | 既存維持                                            |
| **タブ閉じる前**（dirty）              | ✅       | `pre-close`                      | ✅                  | 既存 force snapshot を種別変更                      |
| **Window 終了前**（dirty）             | ✅       | `pre-close`                      | ✅                  | 同上                                                |
| **外部変更で reload 確定**             | ❌       | `pre-external-reload`            | ✅                  | **新規 G2 修正**：reload 前にメモリ内容を snapshot  |
| **履歴から復元実行**                   | ❌       | `restore-point`（設定で OFF 可） | ✅                  | **新規 G3 修正**：復元前の現状を保存。デフォルト ON |
| **マイルストーン作成 UI**              | ❌       | `milestone`                      | ✅                  | 既存（UI button、別 issue でスコープ外）            |

### 3.4 Standalone mode（履歴非対応）

§2.1 原則 1 と系（corollary）により、**Standalone mode（Web 単独 / Electron 単一ファイル編集）は履歴機能の対象外**。

実装上の影響：

- `tryAutoSnapshot`（リネーム後 `tryCreateSnapshot`）の `isProjectRef` ガードを **維持**
- Standalone の保存経路（`use-file-io.ts:283-317`）は snapshot 呼び出しを行わない（既存挙動維持）
- UI：Standalone mode では `HistoryPanel` を非表示またはディセーブル + 説明文「履歴機能はプロジェクトモードでのみ利用可能です」

### 3.5 ユーザー preferences（`restore-point` opt-out）

§2.1 原則 2 により、preferences は **DB 永続化**：

```typescript
// getStorageService().saveAppState() / loadAppState() に追加
interface HistoryPreferences {
  /** 復元前の自動 snapshot を作成するか（デフォルト true） */
  createRestorePointBeforeRestore: boolean;
}
```

UI：設定パネルに「復元前に現在の状態を自動保存する」チェックボックス（デフォルト ON）。

---

## 4. UI 仕様

### 4.1 履歴パネル（既存 `HistoryPanel.tsx`）

- 種別バッジに新 3 種を追加（`pre-close` / `pre-external-reload` / `restore-point`）
  - 既存 `getSnapshotTypeLabel` / `getSnapshotTypeBadgeClass` に case 追加
- フィルター UI：「全て / 手動のみ / 自動のみ / マイルストーン / 緊急（pre-close, restore-point, pre-external-reload）」
- bookmark 既存維持
- Standalone mode では非表示またはディセーブル + 説明文

### 4.2 ステータスバー

- **新規**：保存失敗の永続バッジ「⚠ 保存失敗（再試行 / 詳細）」
- 既存の「保存中…」「保存済み <時刻>」は維持

### 4.3 設定パネル

- **新規**：「履歴」セクション
  - チェックボックス「復元前に現在の状態を自動保存する」（`createRestorePointBeforeRestore`、デフォルト ON）

---

## 5. 実装フェーズ（Phase 5 で issue 化）

### Wave 1（B1 修正：最小 critical fix）

- **gap-B1**: `tryAutoSnapshot` を `tryCreateSnapshot(type, ...)` にリネーム、`type` を引数化
- **gap-B2**: CLAUDE.md の interval 記載を 5s/20s に修正
- 影響：1 PR、既存 SnapshotType の拡張不要、retention 変更不要
- **このバンドルで「Cmd+S が `manual` 種別を生成する」B1 が解消**

### Wave 2（種別拡張：snapshot type 追加）

- **gap-G3**: `restore-point` 種別追加 + `restoreSnapshot` 内で前段に `createSnapshot({type: "restore-point"})`、設定 toggle 連動
- **gap-G2**: `pre-external-reload` 種別追加 + `use-electron-menu-bindings.ts:223-251` の reload 確定直前で snapshot 作成
- **gap-pre-close-rename**: 既存 close 前 force snapshot の種別を `auto` から `pre-close` に変更
- 影響：2〜3 PR、`SnapshotType` 拡張、index.json 後方互換

### Wave 3（retention 仕様化）

- **gap-retention**: `HistoryIndex` に `retention` フィールド追加、種別ごとに pruning ロジック分岐
- **永久保存対応**：`manual` / `pre-close` / `milestone` を pruning 対象から除外
- 影響：1 PR、index 読込時のマイグレーション

### Wave 4（preferences）

- **gap-restore-pref**: `getStorageService().saveAppState/loadAppState` 経由で `createRestorePointBeforeRestore` を永続化、設定パネルに UI 追加
- 影響：1 PR、UI 含む

### Wave 5（失敗 UX）

- **gap-G5**: 保存失敗リトライ + 永続バッジ
- **gap-G6**: auto-save 失敗の status bar 表示
- 影響：1 PR、UI 変更含む

### Wave 6（Standalone UX 明示化）

- **gap-standalone-clarity**: Standalone mode で `HistoryPanel` を非表示またはディセーブル化、説明文を表示
- 影響：1 PR、UI のみ

> **削除した Wave**（Phase 3 ユーザー判断で不要化）：
>
> - 旧 Wave 4（Standalone mode 履歴対応 G1）→ 仕様非対応
> - 旧 Wave 6（blur / tab-switch 即時保存）→ interval のみで十分
> - 旧 Wave 7（milestone UX）→ 別 issue でスコープ外

---

## 6. 既存 API 互換性

| API                                           | 変更                                                                           | 互換性                             |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| `HistoryService.createSnapshot(opts)`         | `type` enum 拡張                                                               | ✅ 既存値はそのまま動く            |
| `HistoryIndex.maxSnapshots` / `retentionDays` | legacy として残す                                                              | ✅ 起動時に新フィールドへマップ    |
| `getSnapshots(sourcePath?)`                   | 変更なし                                                                       | ✅                                 |
| `restoreSnapshot(id)`                         | 内部で先に `createSnapshot({type:"restore-point"})` を呼ぶ（preferences 連動） | ⚠ 副作用が増える、ドキュメント更新 |
| `tryAutoSnapshot`                             | `tryCreateSnapshot(type, ...)` にリネーム                                      | ❌ private なので問題なし          |

---

## 7. リスクと対策

| リスク                                                           | 対策                                                                                                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 永久保存種別（manual / pre-close）の自然増による index.json 肥大 | retention 強化は意図的に行わない代わりに、UI から一括削除フィルター（種別 × 期間指定）を将来追加。当面は OK と判断（小説執筆のユーザーストーリーに合致） |
| 同時書き込み（multi-window）                                     | 既存 `withIndexLock()` 維持                                                                                                                              |
| `restore-point` で復元前 snapshot が失敗 → 復元自体ブロック？    | snapshot 失敗は warn のみで復元続行（保存系と同じ非ブロッキング）                                                                                        |
| 既存 history 利用者の体験変化                                    | release notes で「手動保存にバッジが付くようになりました」を明記                                                                                         |
| Standalone mode の履歴期待ユーザー                               | UI に「プロジェクトモードに切り替えると履歴を利用できます」誘導を表示                                                                                    |

---

## 8. Phase 3 確定事項（旧オープンクエスチョン）

| #   | 質問                            | 確定                                                                      |
| --- | ------------------------------- | ------------------------------------------------------------------------- |
| 1   | `manual` の retention           | **永久保存**（件数・期間ともに無制限）                                    |
| 2   | `pre-close` の retention        | **永久保存**（manual と同等）                                             |
| 3   | Window blur での即時保存        | **不採用**、interval のみで十分                                           |
| 4   | Standalone Web の履歴デフォルト | **そもそも履歴非対応**（Project mode のみ）                               |
| 5   | `restore-point` opt-out 設定    | **必要**、設定パネルにチェックボックス（デフォルト ON）                   |
| 6   | milestone UI 追加               | **別 issue**、本スコープ外                                                |
| 7   | アーキテクチャ原則              | **「プロジェクト → ディスク、ユーザー設定 → DB」の 2 原則**を §2.1 に明記 |

---

## 9. テスト計画

### 9.1 単体テスト追加

- `HistoryService.createSnapshot` を新種別 3 つで呼ぶ
- 種別ごとの retention rule（特に `manual` / `pre-close` の永久保存）
- `restoreSnapshot` が `restore-point` を先に作る + preferences で OFF 時はスキップ
- legacy index.json（`maxSnapshots` / `retentionDays`）の自動マイグレーション

### 9.2 統合テスト

- Cmd+S → `manual` snapshot が必ず生成（B1 検証）
- Auto-save 連打 → 5 分 throttle が効く
- 外部変更 → reload 確定 → `pre-external-reload` 生成
- 復元 → `restore-point` 生成 → 元に戻れる（preferences ON 時）
- 復元 preferences OFF → `restore-point` 生成されない
- タブ閉じる（dirty）→ `pre-close` 生成、永久保存
- Standalone mode で UI 上履歴パネルが非表示またはディセーブル

### 9.3 手動 QA

- multi-window 同時保存
- power throttle 中の auto-save タイミング
- 永久保存種別の長期運用（数ヶ月使用後の index.json サイズ確認）

---

## 10. 受け入れ基準

- [ ] Cmd+S で UI に **青「手動保存」バッジの履歴**が生成される
- [ ] 復元実行で「復元前」snapshot が自動生成される（設定 ON 時）
- [ ] 設定で復元前 snapshot を OFF にできる
- [ ] 外部変更 reload で「外部変更前」snapshot が自動生成される
- [ ] CLAUDE.md の auto-save interval が実装と一致
- [ ] 既存 history 永続データが新仕様で正しく読める（マイグレーション）
- [ ] `manual` / `pre-close` snapshot が pruning 対象外
- [ ] Standalone mode で `HistoryPanel` が非表示またはディセーブル
- [ ] テストカバレッジ：新種別 3 つすべてに統合テスト

---

## 11. 関連リファクタとの統合

- **#1432 (tab-manager 保存系共通化)**：本設計の §3.1〜§3.3 を `useSaveOrchestrator` 単一 hook に集約。Cmd+S / auto / close / reload の経路を 1 箇所に統合。
- **#1438 (HistoryService 分解)**：本設計の retention rule 拡張と Storage 抽象化に整合。Wave 3 で同時実施可。

各 Wave の issue から `Related: #1432 #1438` を張り、リファクタ完了後に本設計の Wave 群が綺麗に解消される依存関係を明示する。
