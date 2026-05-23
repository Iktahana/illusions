# 保存・履歴・IO 再構築：中間ステータス

- **作成日**: 2026-05-23
- **対象ブランチ**: ローカル `dev`（未 push）
- **計画書**: [2026-05-23-rebuild-save-history-io.md](./2026-05-23-rebuild-save-history-io.md)
- **作業範囲**: Phase 0 〜 Phase 6（削除フェーズと中間ビルド確認）
- **未着手**: Phase 7（新 IO 抽象設計）〜 Phase 10（PR）

---

## 完了済みフェーズ

| #   | フェーズ                          | コミット  | 削減行数 | type-check | test              |
| --- | --------------------------------- | --------- | -------- | ---------- | ----------------- |
| 0   | 準備（baseline + safety branch）  | `9db2960` | —        | baseline 2 | 119/120 file pass |
| 1   | Auto-save 削除（shim）            | `b950b94` | -390     | baseline 2 | 同上              |
| 2   | Save 削除（close-handshake 区別） | `87469ba` | -850     | baseline 2 | 同上              |
| 3   | Load 削除（実態 entrypoint）      | `a581ef3` | -743     | baseline 2 | 同上              |
| 4   | IO (VFS) 削除（stub + IPC 削除）  | `35f38e6` | -1995    | baseline 2 | 同上              |
| 5   | History backend 削除（型 shim）   | `3157c2f` | -2132    | baseline 2 | main 567/567 pass |

**累計**: 5 commits、削除 6,110 行、追加 367 行。

---

## ローカル状態（ユーザーの UI 検証用）

### 動作確認

- `npm run type-check`: **baseline 2 件のみ**（`Editor.tsx:454`、`MilkdownEditor.tsx:844`、`RefObject<HTMLSpanElement | null>` 関連、本リファクタ前から存在）
- `npx next dev -p 3010`: **起動成功**（`Ready in 354ms`、http://localhost:3010）
- `npm test`（main code のみ）: **567/567 pass**
- 安全バックアップ: `backup/pre-rebuild-save-history-2026-05-23` （ローカルのみ）

### 期待される機能不全（仕様通り、Phase 8-9 で再構築する）

- ファイルを開く（File → Open / プロジェクトを開く / 最近のプロジェクト）→ 全部動かない
- Cmd+S / 別名で保存 → 動かない（メニュー項目自体を削除）
- 自動保存 → 動かない
- 履歴パネル → 空状態描画のみ（snapshot ゼロ、復元・作成・ブックマーク全部 no-op）
- 外部ファイル変更検知 → 動かない（file-watcher 経由）
- ユーザー辞書 / 無視リスト → 読み込まれない（VFS 経由）
- WordFrequency 統計 → 動かない
- タブ自動復元（standalone mode）→ 動かない
- プロジェクト自動復元 → 動かない（VFS isRootOpen=false で即時 return）

### 動くもの

- アプリ起動・UI レイアウト描画
- StorageService 系（recent project list、キーマップ、dockview レイアウト、ユーザー設定）の読み書き
- エディタの**メモリ上の編集**（IO 永続化なし）
- ウィンドウ close handshake（flush-state 経路のみ。"閉じる / キャンセル" の 2 択ダイアログ）
- ターミナル、設定、補正、リント（kuromoji 内蔵分）
- エクスポート（PDF / EPUB / DOCX）— ただし TXT export は Phase 8 で復活
- AI クライアント（infra 依存）

---

## 残りのフェーズ（ユーザー判断待ち）

### Phase 7: 新 IO 抽象の設計 / 実装

- 設計骨子（叩き台）: ProjectFileService + AppDataService（StorageService 経由）
- セキュリティ不変条件 5 項目（main 仲介 / ダイアログ承認 / root scoping / traversal 拒否 / sensitive path 拒否）を維持する必要あり
- 詳細設計ドキュメントを別途起こすべき（計画書 §7 オープンクエスチョン）

### Phase 8: 保存・履歴の再設計実装

- 2026-05-06 計画に従う（イベント駆動、auto/manual 種別、restore 前 snapshot、保存失敗 dirty 維持、Project mode 限定）
- 自動保存 5s / 20s interval、外部 reload 前 snapshot

### Phase 9: VFS 依存（非保存系）の再配線

- file-watcher / project-service / workspace-persistence / user-dictionary / ignored-corrections / WordFrequency / use-tab-persistence の VFS 部分を新 IO 抽象へ移行

### Phase 10: ブランチ化 + PR 作成

- ローカル dev → feature/rebuild-save-history-io 切り出し
- ローカル dev を `git reset --hard origin/dev` でクリーン化
- PR body に `Closes #1432 #1438 #1448 #1435`、`Refs #1450 (epic) #1466`

---

## リカバリ手順（万一の場合）

ローカル dev を破壊作業前の状態に戻したい場合:

```bash
git reset --hard backup/pre-rebuild-save-history-2026-05-23
```

origin/dev からまっさらにやり直したい場合:

```bash
git fetch origin
git reset --hard origin/dev
```

ローカル dev 上の commit (9db2960 → 3157c2f) は origin/dev に push されていないため、
リセットで失われるのは本作業のみ（他作業への影響なし）。
