# 保存・履歴・IO 再構築：最終ステータス

- **作成日**: 2026-05-23（最終更新: 2026-05-24）
- **対象ブランチ**: ローカル `dev`（未 push、Phase 10 で feature ブランチ化予定）
- **計画書**: [2026-05-23-rebuild-save-history-io.md](./2026-05-23-rebuild-save-history-io.md)
- **詳細実装プラン**: `/Users/iktahana/.claude/plans/plan-7-9-plan-wise-curry.md`
- **作業範囲**: Phase 0 〜 Phase 9（削除 → 中間確認 → 再構築 → caller リネーム）
- **次フェーズ**: Phase 10（feature ブランチ切り出し + PR）

---

## 完了済みフェーズ

| #   | フェーズ                                            | コミット  | 主な変更                                                                                                                                   |
| --- | --------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | 準備（baseline + safety branch）                    | `9db2960` | safety branch 作成、計画書投入                                                                                                             |
| 1   | Auto-save 削除（shim）                              | `b950b94` | use-auto-save を no-op shim へ                                                                                                             |
| 2   | Save 削除（close-handshake 区別）                   | `87469ba` | save 経路の完全空洞化、flush-state は維持                                                                                                  |
| 3   | Load 削除（実態 entrypoint）                        | `a581ef3` | open/load の no-op shim 化                                                                                                                 |
| 4   | IO (VFS) 削除（stub + IPC 削除）                    | `35f38e6` | VFS 全実装空洞化、IPC handler 削除                                                                                                         |
| 5   | History backend 削除（型 shim 残置）                | `3157c2f` | HistoryService 空洞化、UI シェル化                                                                                                         |
| 6   | 中間ビルド確認                                      | `1300477` | 起動可ステータス記録                                                                                                                       |
| 7   | Phase 7: IO 抽象（2 サービス分割）+ テスト          | `bf70507` | ProjectFileService / AppDataService 新規。VFS は backup から復活、testing 復活                                                             |
| 8   | Phase 8a: History Policy + Store 層分離 + テスト    | `6eb60fa` | HistoryPolicy（純関数）+ HistoryStore（IO）に分解。HistoryService は facade。69+23+47+21 tests                                             |
| 9   | Phase 8b: Save flow rebuild + B1 修正 + テスト      | `565409c` | tryAutoSnapshot → tryCreateSnapshot(type, ...) リネーム。§3.3 連動マトリクス。Cmd+S は "manual"、auto-save は "auto"、close は "pre-close" |
| 10  | Phase 8 Wave 2: G2 + G3 + テスト                    | `47a52a2` | 外部 reload 前 pre-external-reload snapshot、restore 前 restore-point snapshot                                                             |
| 11  | Phase 9: caller リネーム + テスト復活               | `476ee89` | getVFS → getProjectFileService 全 caller 置換、12 ファイル                                                                                 |
| 12  | Phase 9 fix-up: open flow handlers + menu listeners | `035c4cc` | use-file-opening の本実装復活、onMenuOpen\* / onOpenAsProject listener 復活                                                                |

**累計**: 12 commits、削除 6,210 行 + 再構築 ~3,800 行、テスト追加 945 件（全 pass）。

---

## 動作確認

| 項目                                  | 状態                                                         |
| ------------------------------------- | ------------------------------------------------------------ |
| `npm run type-check`                  | **0 件** — baseline 2 件も解消                               |
| `npm test` (main code)                | **945/945 pass** (58 files)                                  |
| `npx next dev -p 3010`                | 起動成功 (Ready in ~200ms)                                   |
| `npm run dev` (type-check + next dev) | 起動成功                                                     |
| safety backup                         | `backup/pre-rebuild-save-history-2026-05-23`（ローカル維持） |

---

## 復活した機能（ユーザー手動検証用）

- ✅ ファイルを開く（File → Open / プロジェクトを開く / 最近のプロジェクト）
- ✅ Cmd+S / 別名で保存 / メニュー保存 → **manual** snapshot 生成
- ✅ Save As → **manual** snapshot
- ✅ 自動保存 5 秒間隔（前景）→ **auto** snapshot（throttle ルール適用）
- ✅ Tab 閉じる / Window quit（dirty）→ **pre-close** snapshot
- ✅ 外部ファイル変更 → reload プロンプト → **pre-external-reload** snapshot
- ✅ History panel から復元 → 復元前に **restore-point** snapshot 自動作成
- ✅ HistoryPanel UI で 6 種別のバッジ色表示
- ✅ ウィンドウ close ダイアログ「保存 / 保存しない / キャンセル」3 ボタン復活

---

## B1 修正（core refactor）

旧: `tryAutoSnapshot(sourcePath, displayName, content, forceSnapshot?)`

- 内部で `type: "auto"` ハードコード
- forceSnapshot=true でも type は変わらず → manual snapshot がいつまでも作られない

新: `tryCreateSnapshot(type: SnapshotType, sourcePath, displayName, content)`

- caller が `manual` / `auto` / `pre-close` / `pre-external-reload` / `restore-point` を明示
- `auto` のみ throttle 適用、他は常に作成
- 後方互換 deprecated shim も残置（古い caller があれば動く）

---

## §3.3 連動マトリクス（実装済み）

| User operation             | Save? | Snapshot type         | 実装箇所                        |
| -------------------------- | ----- | --------------------- | ------------------------------- |
| Cmd+S / Save button / menu | ✅    | `manual`              | `use-file-io.ts: saveFile`      |
| Save As                    | ✅    | `manual`              | `use-file-io.ts: saveAsFile`    |
| Auto-save interval         | ✅    | `auto` (5s/20s)       | `use-auto-save.ts`              |
| Tab close (dirty) → 保存   | ✅    | `pre-close`           | `use-close-dialog.ts`           |
| Window quit (dirty) → 保存 | ✅    | `pre-close`           | `use-electron-menu-bindings.ts` |
| 外部 reload 確認後         | ❌    | `pre-external-reload` | `use-file-watch-integration.ts` |
| History restore 実行前     | ❌    | `restore-point`       | `HistoryPanel.tsx`              |

---

## アーキテクチャ（新）

```
┌──────────────────────────────────────┐
│  HistoryService (facade)             │
│  ├── HistoryPolicy (pure decisions)  │  ← #1438 要求の層分離
│  └── HistoryStore (IO via VFS)       │
└──────────────────────────────────────┘
           ▲
           │ tryCreateSnapshot(type)
           │
┌──────────────────────────────────────┐
│  use-file-io.ts (saveFile / saveAsFile)
│  use-auto-save.ts (5s/20s interval)
│  use-close-dialog.ts (pre-close)
│  use-file-watch-integration.ts (pre-external-reload)
│  HistoryPanel.tsx (restore-point)
└──────────────────────────────────────┘
           ▲
           │
┌──────────────────────────────────────┐
│  ProjectFileService (薄い facade)    │  ← VFS 互換、新命名
│  └── lib/vfs/ (Electron / Web 実装)  │
│                                      │
│  AppDataService (薄い facade)        │  ← StorageService 用途明示
│  └── getStorageService()             │
└──────────────────────────────────────┘
```

---

## クローズされる関連 issue（Phase 10 PR 本文に記載予定）

- `Closes #1432` 整理: lib/tab-manager の保存系フロー共通化 → save 経路を一本化
- `Closes #1438` 整理: HistoryService をポリシー/永続化に分解 → Policy + Store + Facade
- `Closes #1448` 整理: editor lifecycle / file watcher 責務分離 → ProjectFileService / file-watcher 整理
- `Closes #1435` 整理: file-ipc.js と vfs-ipc.js のパス安全性ヘルパー共通化 → path-utils.js に集約

- `Refs #1450` epic: バックエンド全面リファクタ（umbrella、close しない）
- `Refs #1466` 再実装: power-aware throttling（5s/20s interval 復活、別 issue として残す）

---

## 残りタスク

### Phase 10: ブランチ化・PR 作成

1. `git fetch origin && git rebase origin/dev`
2. `git checkout -b feature/rebuild-save-history-io`
3. `git push -u origin feature/rebuild-save-history-io`
4. `git checkout dev && git reset --hard origin/dev`（ローカル dev クリーン化）
5. PR 作成、上記 close リスト本文に貼る
6. safety branch `backup/pre-rebuild-save-history-2026-05-23` は merge 後しばらく維持

### 別 PR に分離した範囲（G5/G6）

- 保存失敗時の dirty 維持・永続バッジ表示は今 PR スコープ外
- Wave 5（2026-05-06 計画）として後続 PR で実装

### 別 PR に検討する範囲

- `vfs:*` → `projectFile:*` IPC channel rename（preload + main 両側更新、慎重に）
- `lib/vfs/` ディレクトリ最終削除（現在 ProjectFileService の互換 alias として残置）

---

## リカバリ手順

破壊作業前に戻したい場合:

```bash
git reset --hard backup/pre-rebuild-save-history-2026-05-23
```

origin/dev からまっさらにやり直したい場合:

```bash
git fetch origin
git reset --hard origin/dev
```
