---
name: release-beta
description: >
  illusions プロジェクト専用ベータ発行スキル。dev ブランチを beta ブランチへマージし、
  ベータ版（プレリリース）を発行する。「ベータを出して」「beta 発行して」「dev を beta に
  マージして」「release-beta」「新しいベータ版を出して」など、ベータ発行を意図する発言で
  積極的に使用する。安定版への昇格 (beta → main) は手動プロセス（自動ワークフローは廃止済み）
  のため、このスキルは扱わない。
---

# release-beta

illusions のベータ発行 (dev → beta) を担当するリリースエンジニアとして動く。
beta ブランチへ push すると `build.yml` が **自動で** `vX.Y.Z-beta.YYYYMMDD.HHMMSS`
形式のバージョンを算出し、プレリリースの GitHub Release（`beta` channel の更新メタデータ
付き）を生成する。

> **重要**: タグは一切手動で打たない。ベータ版番号もタグも build.yml が自動生成する。
> `-beta` の前の `X.Y.Z` は「次に main へ昇格される安定版番号」と一致する（安定版タグから
> +1 して算出され、beta タグは算出対象から除外される）。
>
> **昇格は扱わない**: `beta → main` の安定版昇格は手動プロセス。自動化していた
> `weekly-release.yml` は廃止済み（2026-07-12）— 昇格したい場合はユーザーが手動で
> `beta` → `main` の PR を作成・マージする。

---

## Phase 1 — 状況把握

```bash
git fetch origin
git log origin/beta..origin/dev --oneline | head -20
```

- 差分がゼロなら発行するものがないのでユーザーに伝えて終了。
- `origin/beta` が存在しない場合は初回。`git branch beta origin/main` 等で beta を用意してから進む
  （通常は既に存在する）。

---

## Phase 2 — dev を beta へマージして push

```bash
git checkout -B beta origin/beta
git merge --no-ff origin/dev
git push origin beta
```

- コンフリクトは基本的に発生しない（beta は dev の祖先列になっているため）。万一発生したら
  dev 側を優先で解決し、判断に迷う箇所はユーザーに見せて確認する。
- beta ブランチに branch protection（"Build must be passed" ルールセット等）があり直 push が
  弾かれる場合は、`gh pr create --base beta --head dev` で PR を作り CI 通過後にマージする。

---

## Phase 3 — ベータビルドの確認

beta への push で `build.yml` が起動する。プレリリースの生成を確認する。

```bash
gh run list --branch beta --workflow build.yml --limit 5 \
  --json status,conclusion,displayTitle,databaseId
```

ビルド成功後、プレリリースが作られたか確認:

```bash
gh release list --limit 5
# 最新が v<X.Y.Z>-beta.<YYYYMMDD.HHMMSS>（Pre-release）になっていること
```

- `beta-mac.yml` / `beta.yml` / `beta-linux.yml`（更新メタデータ）が Release 資産に含まれることで、
  アプリ内で beta opt-in したユーザーが更新を受信できる。
- CI が RED の場合は `gh run view <databaseId> --log-failed` で原因を実証してから対処する。
  推測でタグを打ったり手動リリースを作ったりしない。

---

## まとめ報告

完了後、以下の形式でユーザーに報告する:

```
## ベータ発行完了 🧪

- **バージョン**: v<X.Y.Z>-beta.<YYYYMMDD.HHMMSS>（Pre-release）
- **beta ブランチ**: dev をマージ済み・push 済み
- **ビルド**: Desktop Build and Release — success
- **配信**: beta opt-in 済みデスクトップ版ユーザーに更新通知

### 含まれた変更
<git log origin/beta..origin/dev --oneline（マージ前の差分）>
```

---

## 重要な制約

- **タグもバージョン番号も手動で作らない。** build.yml が beta 版番号を自動算出・タグ付けする
  （メモリ `project_release_workflow_versioning` 準拠）。
- **このスキルは beta → main 昇格を行わない。** 安定版リリースは手動プロセス
  （自動ワークフローは廃止済み）——昇格が必要な場合はユーザーが別途手動で対応する。
- **beta ブランチ以外には触れない。** dev → beta の発行だけを扱う。
- **package.json の `version` フィールドとは無関係。** バージョンは git タグ + build.yml で管理する。
