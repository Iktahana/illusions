---
description: 現在のブランチから dev へ PR を作成する。関連 Issue を自動検出してクローズし、作成後に衝突を検出・修復する。
---

You are creating a Pull Request for the current branch. Follow every step below
in order. Do not skip steps. Do not ask for confirmation unless explicitly told
to.

---

## Step 1 — Situational check

```bash
git status --short
git branch --show-current
git log dev..HEAD --oneline
```

- If there are uncommitted changes that belong to this task, stage and commit
  them with a Conventional Commits message before continuing.
- If the branch is `dev`, `main`, or `master`, stop and tell the user:
  "PR は feature ブランチから作成してください。現在のブランチは <branch> です。"

---

## Step 2 — Detect related Issues

Search for Issue numbers in three places and build a deduplicated list:

1. **Branch name** — extract `#NNN` or bare numbers after `/` (e.g.
   `fix/issue-123` → `#123`, `feature/842-foo` → `#842`)
2. **Commit messages** since `dev`:
   ```bash
   git log dev..HEAD --oneline
   ```
   Extract patterns like `(#NNN)`, `closes #NNN`, `fixes #NNN`, `refs #NNN`
   (case-insensitive).
3. **User-supplied args** — if the user passed Issue numbers after `/open-pr`
   (e.g. `/open-pr 123 456`), include those too.

For each candidate number, verify the Issue exists:
```bash
gh issue view <NNN> --json number,title,state 2>/dev/null
```
Only include Issues that exist and are **open**.

If no Issues are found, continue without close keywords — do not invent them.

---

## Step 3 — Push branch

```bash
git push -u origin HEAD
```

If the push fails due to divergence, investigate before force-pushing. Only
use `--force-with-lease` if you are certain the remote has no commits that
aren't in the local branch.

---

## Step 4 — Build PR body

Compose the PR body using this template:

```
## Summary

<3–5 bullet points describing WHAT changed and WHY. Focus on user-visible
impact, not implementation details. Write in Japanese.>

## Changes

<Sectioned list of key file/area changes, grouped logically. Japanese OK.>

## Test plan

- [ ] <specific thing to verify>
- [ ] <specific thing to verify>

<If related Issues were found, add a closing section:>

## Closes

Closes #NNN
Closes #MMM

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Rules:
- Use `Closes #NNN` (not `Fixes`, not `Resolves`) for each verified open Issue.
- Keep the title under 72 characters, Conventional Commits format:
  `type(scope): subject` — use the dominant change type from commits.
- PR targets **`dev`** branch (never `main`).

---

## Step 5 — Create PR

```bash
gh pr create \
  --base dev \
  --title "<title>" \
  --body "$(cat <<'BODY'
<body>
BODY
)"
```

Print the PR URL after creation.

---

## Step 6 — Conflict check (run immediately after Step 5)

Wait 3 seconds for GitHub to compute mergeability, then check:

```bash
sleep 3
gh pr view <NUMBER> --json mergeable,mergeStateStatus
```

### If `mergeable == "MERGEABLE"`:
Report: "✓ 衝突なし — PR #NNN はそのままマージ可能です。" Done.

### If `mergeable == "CONFLICTING"`:
Announce: "衝突を検出しました。自動修復を開始します。"

Then execute the conflict resolution loop:

```bash
git fetch origin dev
git merge origin/dev --no-edit
```

For each conflicting file:

1. Read the file and identify all `<<<<<<<` / `=======` / `>>>>>>>` markers.
2. Resolve by keeping logic from **both sides** where possible:
   - Features/additions from HEAD: **always keep**
   - Features/additions from origin/dev: **always keep** (they were merged by
     someone else intentionally)
   - When the same line was changed differently: use HEAD's version for code
     you authored in this PR; use dev's version for everything else
3. After resolving, verify no markers remain:
   ```bash
   grep -rn "<<<<<<\|=======\|>>>>>>>" <file>
   ```
4. Stage the resolved file: `git add <file>`

After all files are resolved:

```bash
git commit -m "merge: resolve conflicts with dev

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```

Then re-check:
```bash
sleep 5
gh pr view <NUMBER> --json mergeable,mergeStateStatus
```

If still `CONFLICTING`, read each conflicting file again more carefully and
repeat the resolution. If after two attempts the conflict cannot be resolved
automatically, show the conflicting sections to the user and ask for guidance.

### If `mergeable == "UNKNOWN"` or the API returns an error:
Wait 10 more seconds and retry once. If still unknown, report the raw JSON and
continue — do not block on GitHub's caching delay.

---

## Step 7 — Final report

Output a concise summary:

```
PR #NNN: <title>
URL: <url>
Base: dev ← <branch>
Closes: #NNN, #MMM  (or "なし")
Conflicts: なし / 修復済み
```
