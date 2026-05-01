---
issue: https://github.com/Iktahana/illusions/issues/1392
status: approved
reviewer: Codex (3 rounds, converged)
---

# Plan: Remove `www/` and all related CI/CD configuration

## Goal

Issue #1392 「Phase 2: Remove www directory and related CI/CD configurations」に沿って、旧リポジトリから分離された `www/` ディレクトリおよびそれに紐づく GitHub Actions / 設定ファイル / 文書を完全に除去する。分離先の `Iktahana/www.illusions.app` リポジトリが安定稼働していることは前提確認済み。

## Architecture

本 PR は **削除専用** の変更であり、デスクトップ/Electron/Next.js ランタイムコードには一切手を入れない。影響範囲は:

1. **ソースツリー**: `www/` 配下の静的サイトソース (Vite + TypeScript)
2. **CI/CD**: `Deploy www to GitHub Pages` ワークフローおよび `build.yml` が持つ除外条件
3. **依存関係管理**: Dependabot の `/www` npm エントリ
4. **ビルド設定**: `electron-builder` の除外指定、`tsconfig.json` の除外、`.gitignore`
5. **文書**: `ARCHITECTURE.md` の directory-map セクション

外部 URL (`https://www.illusions.app/`, `.../downloads/` など) は **分離先リポジトリの公開サイト** を指しているため、**削除せず保持する**。

## Tech Stack

- GitHub Actions YAML
- Dependabot config (`.github/dependabot.yml`)
- `package.json` の `build.files` (electron-builder)
- `tsconfig.json`, `.gitignore`

## Out of Scope

- 外部 URL `https://www.illusions.app/**` の書き換え (分離先で引き続き配信される)
- GitHub リポジトリ側の設定変更 (GitHub Pages 環境の無効化, branch protection ルール) — これはリポジトリ管理者が別途確認。plan 本文ではチェックリストのみ記載
- デスクトップアプリコード / 機能の変更

## Pre-flight Check (implementer が最初に確認)

- [ ] `Iktahana/www.illusions.app` リポジトリが `https://www.illusions.app/` で配信稼働中であることを実ブラウザで確認
- [ ] `https://www.illusions.app/downloads/` サブパスが 200 を返すことを確認 (README.md と `components/DesktopAppDownloadButton.tsx` が依存)
- [ ] 現在の worktree がクリーンであることを `git status` で確認

---

## Task 1 — Create feature branch & worktree

- [ ] CLAUDE.md §3 の規約に従い、独立 worktree を切る:
  ```bash
  git worktree add ../illusions-work-cleanup-www feature/remove-www
  cd ../illusions-work-cleanup-www
  ```
- [ ] `git status` で clean を確認

**Verification**: `git worktree list` に新 worktree が表示されること。

---

## Task 2 — Delete `www/` directory

- [ ] `git rm -r www/` で `www/` 配下を全削除
- [ ] `git status` で `www/` 配下が deleted 表示されること
- [ ] ルート直下から `www/` が消えていることを `ls www 2>&1` で確認 (エラー `No such file or directory`)

**Verification**: `git ls-files www/ | wc -l` が 0。

---

## Task 3 — Delete `deploy-www.yml` workflow

- [ ] `git rm .github/workflows/deploy-www.yml`
- [ ] 他のワークフローに同名参照が残っていないか:
  ```bash
  grep -rn "deploy-www" .github/
  ```
  → `build.yml` の `paths-ignore` にヒットするはず (次 Task で処理)

**Verification**: `ls .github/workflows/deploy-www.yml` が not found。

---

## Task 4 — Update `.github/workflows/build.yml`

`www/` と `deploy-www.yml` への参照を **全撤去**。本ワークフローは元々 www の変更でデスクトップビルドを走らせない除外条件を持っていたが、www が消えるので除外自体が不要になる。

変更点:

- [ ] Lines 12-15 の `paths-ignore`:
  ```yaml
  # BEFORE
  paths-ignore:
    - "www/**"
    - "store/**"
    - ".github/workflows/deploy-www.yml"
    - ".github/workflows/sync-ms-store-listing.yml"
  # AFTER
  paths-ignore:
    - "store/**"
    - ".github/workflows/sync-ms-store-listing.yml"
  ```
- [ ] Lines 18-22 の PR 側 `paths-ignore` も同じく `www/**` と `deploy-www.yml` 行を削除
- [ ] `detect-changes` ジョブ:
  - Line 30 のコメント `# only www/ assets are touched` → 意味を失うので削除、またはコメントを「store 変更のみのとき desktop をスキップする」に差し替え
  - Line 51 の `- '!www/**'` を削除
  - Line 57 の `- '!.github/workflows/deploy-www.yml'` を削除
  - Line 62 のコメント `# PRs that touch only www/ or documentation are intentionally skipped.` を「store / documentation」に修正 (documentation 除外は `!docs/**` で残るため)

**Verification**:

```bash
grep -n "www" .github/workflows/build.yml
```

→ 0 件。YAML 構文検証:

```bash
npx --yes js-yaml .github/workflows/build.yml > /dev/null && echo OK
```

(もしくは `yamllint`)

---

## Task 5 — Update `.github/dependabot.yml`

- [ ] Lines 34-52 の `/www` npm エントリ (ecosystem: npm, directory: /www, labels: www, group: www_npm) を **丸ごと削除**
- [ ] YAML の先頭コメントブロックは維持

**Verification**:

```bash
grep -n "www" .github/dependabot.yml
```

→ 0 件。

---

## Task 6 — Update `package.json`

- [ ] Line 141 の `"!www/**"` を `build.files` 配列から削除。`"!node_modules/**/*"` だけが残る形にする。
- [ ] `npm run type-check` で JSON parse エラーが無いことを確認

**Verification**:

```bash
node -e "console.log(require('./package.json').build.files)"
```

→ `[ 'dist-main/**/*', 'out/**/*', '!node_modules/**/*' ]`。

---

## Task 7 — Update `tsconfig.json`

- [ ] Line 33 の `exclude` 配列から `"www"` を削除:
  ```jsonc
  // BEFORE
  "exclude": ["node_modules", "public/sw.js", "www"]
  // AFTER
  "exclude": ["node_modules", "public/sw.js"]
  ```

**Verification**: `npm run type-check` がグリーン。

---

## Task 8 — Update `.gitignore`

- [ ] Lines 87-89 を削除 (空行含め):
  ```gitignore
  # www build output
  /www/dist
  /www/node_modules
  ```

**Verification**: `grep -n www .gitignore` が 0 件。

---

## Task 9 — Update `ARCHITECTURE.md`

- [ ] Lines 37-38 を削除:
  ```markdown
  `www/`
  Static marketing or web-facing assets that are published separately from the desktop runtime.
  ```
  その前のセクション (`packages/`) と末尾空行の整合を確認。

**Verification**: `grep -n "www/" ARCHITECTURE.md` が 0 件。

---

## Task 10 — Global sweep for residual `www/` path references

外部 URL (`www.illusions.app`, `www.google.com`, `www.idpf.org` 等) は対象外。**ディレクトリ `www/` を指すパス参照** のみ検出する。

- [ ] 下記 `rg` コマンドを実行。正規表現 `(^|[^a-zA-Z0-9.])www/` は「`www` の直後が `/`」を要求するため、`www.illusions.app` 等の外部 URL (直後が `.`) には構造的にヒットしない。外部 URL 向けの追加フィルタは不要。プラン文書自体は `www/` リテラルを多数含むため glob で除外する。
  ```bash
  rg -n --hidden \
    --glob '!.git/**' \
    --glob '!node_modules/**' \
    --glob '!.next/**' \
    --glob '!www/**' \
    --glob '!docs/superpowers/plans/**' \
    -e '(^|[^a-zA-Z0-9.])www/'
  ```
- [ ] 上記コマンドが **exit code 1 (no matches) かつ標準出力が空** で終了すること
  ```bash
  # Verification one-liner (exit 0 when clean, exit 1 when residue remains)
  ! rg -n --hidden \
      --glob '!.git/**' --glob '!node_modules/**' --glob '!.next/**' \
      --glob '!www/**' --glob '!docs/superpowers/plans/**' \
      -e '(^|[^a-zA-Z0-9.])www/'
  ```
- [ ] 万一ヒットが残れば該当箇所を修正、または許容理由を PR 本文に明記

**Verification**: 上記 one-liner (`! rg ...`) が **exit 0** で終了すること。

> Note 1: `--glob '!docs/superpowers/plans/**'` はプラン本文が `www/` 文字列を意図的に含むため除外している。実運用の参照ではない。
>
> Note 2: `rg` は無マッチで exit 1、マッチあり で exit 0 を返す。検証を「`rg` の結果が 0 件」を `exit 0` で表現するため `!` で反転している。`grep -v` でのフィルタは空入力時に exit 1 となる挙動差があるため採用しない。

---

## Task 11 — Full type-check and build verification

- [ ] `npm run type-check` グリーン
- [ ] `npm run build` グリーン (Next.js static build)
- [ ] `npm run electron:build -- --mac --${ARCH} --publish never` を最低 1 アーキで実行
  - ローカルで Electron ビルドが時間がかかる場合、最低限 `npm run bundle:electron` まで通れば OK とし、PR 説明で CI で fullcheck を行う旨を明記
- [ ] 生成された artifact 内に `www/` が含まれていないことを確認:
  ```bash
  # .dmg / .zip / AppImage 等のパッケージ内部に www が無いこと
  find dist-electron -type d -name www
  ```
  → 0 件

**Verification**: 全コマンドがノンゼロ終了コードを返さない。

---

## Task 12 — Commit & push

- [ ] 全変更を 1 コミット (もしくは削除・設定・文書で分割可) でまとめる。推奨単一コミット:

  ```
  chore(repo): remove www/ directory and related CI configuration

  After migrating the marketing site to Iktahana/www.illusions.app,
  drop the legacy www/ sources, deploy-www workflow, dependabot entry,
  electron-builder exclusion, tsconfig exclude, .gitignore rules, and
  the ARCHITECTURE.md directory-map section.

  Closes #1392

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```

- [ ] `git push -u origin feature/remove-www`
- [ ] **dev** ブランチに対して PR を作成 (CLAUDE.md §2: feature → dev)

**Verification**: PR ページで diff が上記タスクの範囲内に収まっていること。

---

## Task 13a — Pre-merge admin checks (PR マージ前に必須)

コード側の修正だけでは PR がマージ可能にならないため、**PR を開いた直後** に管理者が以下を確認・実施する。

- [ ] Branch protection / required-status-check から `Deploy www to GitHub Pages` / `deploy-www` 系ジョブを **削除**。残したまま `dev` (および `main`) ブランチに対する protection rule に乗っていると、該当ジョブが実行されない PR は永久に "Expected — Waiting for status to be reported" 状態となりマージ不能になる。
  - GitHub UI: Settings → Branches → Branch protection rules → 当該ルール → "Require status checks to pass before merging" のリストから削除
  - 代替: gh CLI で確認 `gh api repos/Iktahana/illusions/branches/dev/protection --jq '.required_status_checks.contexts'`
- [ ] 他にも `deploy-www` を required として設定している箇所が無いかを Rulesets (Repository rulesets / Org rulesets) も含めて確認

**Verification**: 上記コマンドの出力に `Deploy www to GitHub Pages` や `deploy-www` 系のチェック名が含まれないこと。

---

## Task 13b — Post-merge follow-ups

PR マージ後に並行で実施する項目:

- [ ] GitHub Pages 環境の無効化確認: Settings → Pages → Source を "None" に (旧 www が GH Pages に残っていた場合)
- [ ] Environment `github-pages` / 関連 secrets が旧 www 専用で他に使われていないなら削除検討
- [ ] Dependabot の Insights 画面で `/www` ターゲットの古い PR が残っていたら close

---

## Rollback

単一コミットでまとまる想定のため、問題発生時は:

```bash
git revert <merge-commit> -m 1
```

で即復旧可能。www 配下の実コードは既に分離先リポジトリに存在するので、このリポジトリに戻す必要は通常発生しない。

---

## Risks & Mitigations

| Risk                                                                                        | Mitigation                                                                                    |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `build.yml` の `paths-ignore` 修正で CI 挙動が変わり、不要な desktop build がトリガーされる | `store/**` 除外と `detect-changes` の他の `!` ルールは維持。PR を開いた時点で CI の反応を確認 |
| `deploy-www.yml` を required check にしている branch protection が残り PR が pending        | Task 13 で管理者が手動確認                                                                    |
| `https://www.illusions.app/downloads/` サブパスが新リポジトリで未実装                       | Pre-flight Check で事前検証。未配信ならリンク書き換えを追加タスクとして別 Issue 化            |
| `www/package-lock.json` 削除によって Dependabot が直前に開いた PR が失効                    | 該当 PR は自動 close される。手動 close しても可                                              |

---

## Review Iteration 1 (Codex)

### Accepted

- **R1 (IMPORTANT)**: Task 10 grep was not self-excluding. Updated command to add `--glob '!docs/superpowers/plans/**'` and switched to `rg` form; added a note explaining why.
- **R2 (SUGGESTION)**: Required-status-check cleanup is a pre-merge gate. Split original Task 13 into:
  - **Task 13a** — pre-merge admin check (remove `deploy-www` from required checks)
  - **Task 13b** — post-merge hygiene (Pages source, secrets, Dependabot cleanup)

### Verified by Codex (no changes needed)

- No workflow has `needs:` dependency on `deploy-www`.
- No cache keys / artifact names in `build.yml` reference `www`.
- `scripts/generate-credits.ts` does not scan `www/node_modules`.
- Serwist PWA config (`next.config.ts`, `app/sw.ts`) has no `www/` path.
- `vercel.json` has no `www` reference.

---

## Review Iteration 2 (Codex)

### Accepted

- **R1 (Medium, persisted)**: The revised Task 10 command still had a pipeline to `grep -v ...`, which exits `1` on empty input, breaking the "exit 0 when clean" invariant. **Fix applied**: dropped the `grep -v` entirely (the regex `(^|[^a-zA-Z0-9.])www/` requires a `/` immediately after `www`, so external URLs like `www.illusions.app` do not match and filtering is redundant). Added an inverted one-liner `! rg …` so the verification command exits `0` on a clean tree. Added Note 2 explaining the exit-code rationale.
- **R2**: Already confirmed resolved by Codex (Task 13a/13b split accepted).

---

## Review Iteration 3 (Codex)

- **Verdict**: APPROVED.
- **Verified**: `! rg ...` exits 0 on a clean tree, non-zero on residue. Regex `(^|[^a-zA-Z0-9.])www/` matches `www/foo`, `/www/foo`, `./www/dist`, `foo/www/bar`, does not match `www.illusions.app` or similar hostnames. No new issues.
