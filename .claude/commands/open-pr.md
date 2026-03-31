---
description: 現在のブランチから PR を作成する。関連 Issue を自動検出してクローズし、作成後に衝突を検出・修復する。「PR 作って」「open-pr」「PR 出したい」「PR を出す」など、PR 作成を意図する発言で積極的に使用する。
---

You are creating a Pull Request for the current branch. Work through the steps
below in order. Do not pause for confirmation unless a step explicitly says to.

---

## Step 1 — Situational check

```bash
git status --short
git branch --show-current
```

**Guard rails:**

- If the branch is `dev`, `main`, or `master`, stop immediately:
  "PR は feature ブランチから作成してください。現在のブランチは `<branch>` です。"
- If there are uncommitted changes relevant to this task, stage and commit them
  with a Conventional Commits message before continuing.

Then detect the **base branch**:

```bash
# Check project convention file first
grep -i "base.*branch\|target.*branch\|PR.*target\|→.*main\|→.*dev" CLAUDE.md 2>/dev/null | head -3
# Then verify the candidate branch actually exists on the remote
git ls-remote --heads origin dev main master 2>/dev/null
```

Use `dev` if it exists remotely. Otherwise use `main`, then `master`. If the
project's CLAUDE.md clearly names a different base, use that instead.

Check commits that will be in this PR:

```bash
git log <base>..HEAD --oneline
```

If there are zero commits, report: "このブランチには <base> との差分がありません。" and stop.

---

## Step 2 — Check for existing PR

Before creating, verify no PR is already open for this branch:

```bash
gh pr list --head "$(git branch --show-current)" --state open --json number,url,title
```

If one exists, print its URL and ask the user: "このブランチには既に PR #NNN が存在します。新しく作成しますか、それとも既存の PR を更新しますか？"
Wait for the answer before proceeding.

---

## Step 3 — Detect related Issues

Collect Issue numbers from three sources, then deduplicate:

1. **Branch name** — apply this extraction in order:
   - Strip everything up to and including the last `/`
   - Match leading digits: `feature/842-foo` → `842`
   - Match `#NNN` anywhere: `fix/issue-#123-crash` → `123`
   - Match `issue-NNN` or `issues-NNN`: `fix/issue-123` → `123`

2. **Commit messages** since `<base>`:

   ```bash
   git log <base>..HEAD --pretty="%s %b"
   ```

   Extract numbers from these patterns (case-insensitive):
   `(#NNN)`, `close #NNN`, `closes #NNN`, `fix #NNN`, `fixes #NNN`, `resolve #NNN`, `refs #NNN`

3. **User-supplied args** — Issue numbers passed after the command
   (e.g. `/open-pr 123 456`).

For each candidate, verify it exists and is open:

```bash
gh issue view <NNN> --json number,title,state 2>/dev/null
```

Discard any that don't exist or are already closed. If nothing found, continue
without `Closes` keywords — never invent Issue numbers.

---

## Step 4 — Push the branch

```bash
git push -u origin HEAD
```

If this fails with a "non-fast-forward" error, check the remote carefully:

```bash
git log origin/<branch>..HEAD --oneline   # commits only in local
git log HEAD..origin/<branch> --oneline   # commits only in remote
```

Only use `--force-with-lease` if the remote has no commits that aren't already
in the local branch (i.e., the remote has only the old version of your commits).

---

## Step 5 — Compose the PR

**Title** (≤72 chars, Conventional Commits format):
Use the dominant change type from the commits: `type(scope): short description`.
If the commits span multiple types, pick the most impactful one.

**Body template:**

```
## Summary

- <what changed and why — user-visible impact, not implementation details>
- <...>

## Changes

<Key files/areas grouped by concern. A table works well for large PRs.>

## Test plan

- [ ] <concrete verification step>
- [ ] <concrete verification step>

Closes #NNN
Closes #MMM

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Put `Closes #NNN` lines at the bottom of the body (outside any section header)
— GitHub reliably processes them there. Omit the `Closes` lines entirely if no
Issues were found.

Write the body language to match the project's convention (Japanese if the
project's commit history and CLAUDE.md are in Japanese; English otherwise).

---

## Step 6 — Create the PR

```bash
gh pr create \
  --base <base-branch> \
  --title "<title>" \
  --body "$(cat <<'BODY'
<body>
BODY
)"
```

Print the PR URL immediately after creation.

---

## Step 7 — Conflict check with polling

GitHub needs time to compute mergeability. Poll with patience:

```bash
for i in 1 2 3 4 5 6; do
  sleep 8
  STATUS=$(gh pr view <NUMBER> --json mergeable,mergeStateStatus 2>/dev/null)
  MERGEABLE=$(echo "$STATUS" | grep -o '"mergeable":"[^"]*"' | cut -d'"' -f4)
  echo "Check $i/6: $MERGEABLE"
  if [ "$MERGEABLE" = "MERGEABLE" ] || [ "$MERGEABLE" = "CONFLICTING" ]; then
    break
  fi
done
```

### MERGEABLE

Report: "✓ 衝突なし — PR #NNN はそのままマージ可能です。" Skip to Step 8.

### CONFLICTING

Announce: "衝突を検出しました。自動修復を開始します。"

```bash
git fetch origin <base-branch>
git merge origin/<base-branch> --no-edit
```

For each conflicting file reported by git:

1. **Read the whole file** — understand what both sides were trying to do, not
   just the lines immediately around the markers.
2. **Resolve semantically:**
   - If one side _added_ something the other didn't touch → keep the addition.
   - If both sides changed the same region in compatible ways → merge both
     changes together.
   - If both sides changed the same region incompatibly → keep the version that
     makes the most logical sense given this PR's intent. When genuinely
     uncertain, keep the incoming `origin/<base>` version and note it in the
     commit message for human review.
3. **Verify clean:**
   ```bash
   grep -n "<<<<<<\|=======\|>>>>>>>" <file>
   ```
4. Stage: `git add <file>`

After resolving all files:

```bash
git commit -m "merge: resolve conflicts with <base-branch>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```

Re-check mergeability (same polling loop, 3 retries this time). If still
CONFLICTING after the second attempt, show the conflicting sections verbatim
and ask the user to decide.

### UNKNOWN after all retries

Report the raw JSON and move on — don't block on GitHub's cache.

---

## Step 8 — Final report

```
PR #NNN: <title>
URL: <url>
Base: <base> ← <branch>
Closes: #NNN, #MMM  （なし）
衝突: なし ／ 修復済み ／ 手動対応が必要
```
