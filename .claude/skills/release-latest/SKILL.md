---
name: release-latest
description: >
  illusions プロジェクト専用リリーススキル。dev ブランチを main にマージして
  新バージョンをリリースする。「リリースして」「発布して」「dev を main に
  マージして」「新バージョン出して」「release-latest」「release latest」
  「main にマージするフローを実行して」など、リリース作業を意図する発言で積極的に使用する。
  バージョンタグの自動算出、コンフリクト解決、admin マージ、タグ push まで
  一気通貫で実行する。
---

# release-latest

illusions プロジェクトの週次リリース (dev → main) を担当するリリースエンジニアとして動く。
バージョン算出からタグ push まで一気通貫で完走する。

---

## Phase 1 — 状況把握

### 1a. 最新タグとバージョン確認

```bash
git fetch origin
git tag --sort=-version:refname | head -5
```

バージョンは `v0.1.XXX` 形式。最新タグの最後の数字に +1 したものが次のバージョン。
例: 最新が `v0.1.531` → 次は `v0.1.532`

### 1b. dev と main の差分確認

```bash
git log origin/main..origin/dev --oneline | head -20
```

差分がゼロならリリースするものがないのでユーザーに伝えて終了。

### 1c. 既存のリリース PR チェック

```bash
gh pr list --state open --base main --json number,title,headRefName,mergeable
```

- **既存 PR が MERGEABLE** → そのまま Phase 3（CI チェック）へ進む
- **既存 PR が CONFLICTING** → PR をクローズして Phase 2 で新しいリリースブランチを作り直す
- **既存 PR なし** → Phase 2 へ進む

---

## Phase 2 — リリースブランチの準備

### 2a. 作業前チェック

```bash
git status
```

uncommitted changes があれば stash するか現ブランチを退避させてから進む。

### 2b. リリースブランチ作成とコンフリクト確認

```bash
git checkout -b release/v<NEXT_VERSION> origin/main
git merge --no-commit --no-ff origin/dev 2>&1
```

**コンフリクトなし**（exit 0 かつ "Automatic merge went well" と表示された場合）:

```bash
GIT_EDITOR=true git merge --continue
```

**コンフリクトあり** → 以下のルールで解決する。

#### このプロジェクトのコンフリクト解決ルール

まず main にしか存在しない hotfix コミットを確認する:

```bash
git log origin/dev..origin/main --oneline
```

これに含まれる変更は dev 側に存在しないため、コンフリクト解決時に消さないよう注意する。

| ファイル                   | 解決方針                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `CLAUDE.md`                | dev 側を採用（prettier 整形済み）                                                         |
| `scripts/submit-store.mjs` | dev 側を採用（ダブルクォート、prettier 準拠）                                             |
| `package.json`             | dev 側を採用。`version` フィールドは `"0.1.0"` のまま保持（タグでバージョン管理するため） |
| その他                     | dev 側を優先。ただし上記 hotfix コミットに含まれるファイルは main 側の変更も保持する      |

コンフリクト解決後:

```bash
git add <conflicted-files>
GIT_EDITOR=true git merge --continue
```

判断に迷うコンフリクトは自己判断せず、該当箇所をユーザーに見せて確認を取る。

### 2c. ブランチを push

```bash
git push origin release/v<NEXT_VERSION>
```

### 2d. PR 作成

```bash
gh pr create \
  --base main \
  --head release/v<NEXT_VERSION> \
  --title "release: weekly release v<NEXT_VERSION>" \
  --body "$(cat <<'EOF'
## Weekly Release — v<NEXT_VERSION>

### Changes included

<git log origin/main..origin/dev --oneline の内容を箇条書きで>

### Merge notes

<コンフリクトがあった場合のみ記載>
- `CLAUDE.md`: <解決内容>
- `scripts/submit-store.mjs`: <解決内容>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 3 — CI チェックとマージ

### 3a. CI 状態の確認

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup
```

チェック結果の判断:

| 状態                                   | 対応                                                       |
| -------------------------------------- | ---------------------------------------------------------- |
| 全て SUCCESS                           | そのまま通常マージ                                         |
| **Code Quality** のみ FAILURE          | ユーザーに内容を報告し、`--admin` bypass の許可を求める    |
| Desktop Build / 他の重要 CI が FAILURE | 原因を調査してから進む。自己解決できなければユーザーに相談 |

CI がまだ走り中（IN_PROGRESS）の場合は完了を待ってから判断する。

### 3b. マージ

**通常マージ（CI 全 pass）:**

```bash
gh pr merge <PR_NUMBER> --merge --subject "release: weekly release v<NEXT_VERSION>"
```

**Admin bypass マージ（ユーザーが許可した場合）:**

```bash
gh pr merge <PR_NUMBER> --merge --admin --subject "release: weekly release v<NEXT_VERSION>"
```

マージ確認:

```bash
gh pr view <PR_NUMBER> --json state,mergedAt
```

`state: MERGED` を確認してから次へ進む。

---

## Phase 4 — タグ push とビルド起動

マージ後、バージョンタグを打つ。これにより `Desktop Build and Release` CI が自動起動してビルド・リリースが行われる。

```bash
git fetch origin main
git tag v<NEXT_VERSION> origin/main
git push origin v<NEXT_VERSION>
```

ビルドの起動確認（タグ名で絞り込む）:

```bash
gh run list --event push --limit 10 --json status,conclusion,workflowName,headBranch | \
  python3 -c "
import json, sys
runs = json.load(sys.stdin)
for r in runs:
    if r['headBranch'] == 'v<NEXT_VERSION>':
        print(f\"{r['workflowName']:35} {r['status']:12} {r.get('conclusion','')}\")
"
```

`Desktop Build and Release` が `success` になったらリリース完了。

---

## Phase 5 — クリーンアップ

```bash
git checkout <元のブランチ>
git branch -D release/v<NEXT_VERSION>
git worktree list   # 不要な worktree がないか確認
```

---

## まとめ報告

完了後、以下の形式でユーザーに報告する:

```
## リリース完了 🚀

- **バージョン**: v<NEXT_VERSION>
- **マージ PR**: #<PR_NUMBER>
- **タグ**: v<NEXT_VERSION> → push 済み
- **ビルド**: Desktop Build and Release — success

### 含まれた変更
<git log origin/main..origin/dev --oneline の内容>
```

---

## 重要な制約

- **このリリース PR 以外の PR には触れない。** dev → main の PR だけを扱う。他の feature/fix PR は無視する。
- **main ブランチへの直接コミット禁止。** 必ず PR 経由でマージする。
- **タグは main マージ後に打つ。** タグが build をトリガーするため、マージ前に打たない。
- **バージョン番号は package.json の `version` フィールドとは無関係。** git タグで管理する。
