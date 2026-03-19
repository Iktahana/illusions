# illusions Project - AI Agent Rules

Single source of truth for all AI assistants (Cursor, Claude, etc.)

> **IMPORTANT**: Documentation and code must use English or Japanese only.
> Communication with agents can use any language.

---

## 🔴 CRITICAL RULES - MUST FOLLOW (Non-negotiable)

### 1. Language Standards

**❌ STRICTLY FORBIDDEN in Code/Documentation:**
- **Chinese (中文/中国語)** - ABSOLUTELY PROHIBITED
- **Korean (한국어/韓国語)** - ABSOLUTELY PROHIBITED
- **Any other languages** except English and Japanese

**✅ ALLOWED Languages:**
- **English**: Preferred for code logic (variables, functions, types, comments)
- **Japanese (日本語)**: Required for UI strings, allowed for comments and user-facing documentation

**Where this applies:**
- Code logic: Variable names, function names, class names
- Code comments: All inline and block comments
- Documentation files: README, API docs, technical specs
- String literals: UI text, error messages, log messages
- JSDoc, configuration files, JSON data, YAML files

**✅ ALLOWED in AI Conversations & Planning:**
- AI assistant responses, project planning, internal notes, design documents

### UI/UX Language Requirements

**ALL user-facing text MUST be in Japanese**, including:
- Menu items, dialog boxes, notifications
- Buttons, labels, placeholders, tooltips
- Error messages, update notifications

**Standard UI Translations:**

| English | Japanese |
|---------|----------|
| File | ファイル |
| Edit | 編集 |
| View | 表示 |
| Save | 保存 |
| Open | 開く |
| Close | 閉じる |
| Quit | を終了 |
| Word Count | 文字数 |
| Paragraph Count | 段落数 |
| Reading Time | 読了時間 |

---

### 2. Git Worktree Isolation

**Every task MUST use a dedicated git worktree.**

- **DO NOT** work directly on the main branch worktree for feature/fix tasks
- **DO** create a new worktree + branch for each task before writing any code
- **DO** clean up (remove) the worktree and delete the branch after merging

**Workflow:**
```bash
# 1. Create worktree with a new feature branch
git worktree add ../illusions-work-<short-name> -b feature/<branch-name>
cd ../illusions-work-<short-name>

# 2. Do all implementation work inside the worktree

# 3. After merging to main, clean up
cd /path/to/illusions
git worktree remove ../illusions-work-<short-name>
git branch -d feature/<branch-name>
```

**Rules:**
- One worktree per task — do NOT reuse worktrees across unrelated tasks
- Naming convention: `illusions-work-<short-name>`
- Always verify removal after merge (`git worktree list`)
- **NEVER remove a worktree without verifying it contains no in-progress work**
  - Check `git log main..<branch>` for unmerged commits
  - Check `git status` for uncommitted changes
  - Only remove if fully merged OR user explicitly confirms deletion

---

## 🟡 HIGH PRIORITY RULES

### 4. TypeScript & Code Style Standards

**TypeScript Requirements:**
- **Strict Mode**: All files must work with TypeScript strict mode enabled
- **Type Safety**: Avoid `any`; prefer `unknown` or specific types
- **Type Imports**: Use `import type` for type-only imports
- **Explicit Return Types**: Public functions should have explicit return types

**Naming Conventions:**
- Components/Classes: PascalCase (`EditorComponent`, `StorageManager`)
- Functions/Variables: camelCase (`handleClick`, `isLoading`)
- Constants: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`, `DEFAULT_FONT_SIZE`)
- Types/Interfaces: PascalCase (`EditorProps`, `FileMetadata`)
- Files: kebab-case for utilities (`use-mdi-file.ts`), PascalCase for components (`Editor.tsx`)

**Import Order:**
1. External libraries (React, Next.js, etc.)
2. Internal packages (`@/`)
3. Relative imports (`./`)
4. Types (`import type`)

**Code Organization:**
- Use JSDoc for public functions and complex logic
- Component structure: Props interface → Component → Helper functions → Exports
- Use early returns to reduce nesting

### 5. React Best Practices

- Prefer function components over class components
- Follow React hooks rules (no conditional hooks, proper dependency arrays)
- Name event handlers with `handle` prefix (`handleClick`, `handleChange`)
- Destructure props in function parameters
- Ensure event listeners are cleaned up in `useEffect` return functions
- Check for missing `React.memo`, `useCallback`, or `useMemo` optimizations

### 6. Security Standards

- **Sensitive Data**: Never hardcode API keys, passwords, tokens, or credentials
- **Electron IPC**: `contextIsolation: true`, `nodeIntegration: false`, validate all IPC inputs
- **XSS Prevention**: No unsafe DOM manipulation, no unescaped user input
- **Code Injection**: No `eval()`, `Function()`, or dynamic script execution
- **File System**: Validate all file paths in Electron main process

---

## 🟢 PROJECT-SPECIFIC RULES

### 7. Storage Service (CRITICAL - ALWAYS USE)

**DO NOT implement your own storage logic. ALWAYS use the unified StorageService.**

```typescript
import { getStorageService } from "@/lib/storage/storage-service";

const storage = getStorageService();
await storage.saveSession({ appState: { lastOpenedMdiPath: "/path/to/file.mdi" }, recentFiles: [], editorBuffer: { content: "...", timestamp: Date.now() } });
const session = await storage.loadSession();
```

**12 Core Methods:**
- **Session**: `saveSession()`, `loadSession()`
- **App State**: `saveAppState()`, `loadAppState()`
- **Recent Files**: `addToRecent()`, `getRecentFiles()`, `removeFromRecent()`, `clearRecent()`
- **Editor Buffer**: `saveEditorBuffer()`, `loadEditorBuffer()`, `clearEditorBuffer()`
- **Utility**: `clearAll()`

**Storage Locations:**
- Electron: SQLite at `~/Library/Application Support/illusions/illusions-storage.db`
- Web: Browser IndexedDB via Dexie

**❌ Never:**
- Implement custom storage logic per component
- Use `localStorage` directly in Electron
- Manually interact with IndexedDB or SQLite

**✅ Always:**
- Use `getStorageService()`
- Auto-save editor buffer every 30 seconds

> Full documentation: `docs/architecture/storage-system.md`

### 8. Electron-Specific Rules

- Use typed IPC channels defined in `types/electron.d.ts`
- Always validate input in IPC handlers
- Use Electron's dialog API for file selection
- Use StorageService abstraction (`electron-storage.ts`), not localStorage

### 9. Next.js-Specific Rules

- Mark with `"use client"` when using browser APIs or React hooks
- Default to server components when possible
- Use Next.js dynamic imports for code splitting

### 10. Milkdown Plugin Development

- Follow the established pattern in `packages/milkdown-plugin-japanese-novel/`
- Properly type ProseMirror schemas and plugins
- Use kuromoji for Japanese text tokenization
- For `.mdi` content, follow syntax rules in `MDI.md`

### 11. Performance Standards

- Flag expensive operations that should be memoized or moved to workers
- Check for unnecessary imports or large libraries
- Review IndexedDB (Dexie) queries for efficiency

---

## 🔵 WORKFLOW & COLLABORATION RULES

### 12. Token Usage Optimization

- ❌ DO NOT read entire codebase or directory tree without specific need
- ✅ Only read files directly relevant to the current task
- ✅ Use `Grep` to search for specific patterns before reading files
- ✅ Use `offset` and `limit` parameters when reading large files
- Avoid using `Read` on generated files (`dist/`, `out/`, `node_modules/`, `.next/`)

### 13. Commit Message Standards

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject> (#issue)

<body>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

**Issue References (CRITICAL):**
- General reference: `feat: add feature (#123)`
- Closes issue: `fix: resolve bug (closes #456)`
- Part of larger: `feat: implement component (part of #789)`

**Example:**
```
feat: add glassmorphism to all dialogs (#234)

- Create reusable GlassDialog component
- Apply frosted glass effect with backdrop-blur-xl

Closes #234

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### 14. Issue Closing Policy

**CRITICAL**: Never close GitHub Issues manually. Always close via PR merge.

- Use `Closes #<issue>` or `Fixes #<issue>` in the **PR description body**
- GitHub auto-closes the issue when the PR is merged to the default branch
- Do NOT use `gh issue close` or close from the GitHub UI

### 15. Testing Standards (Future)

- **Unit Tests**: All utility functions
- **Component Tests**: Critical components
- **E2E Tests**: Main user flows

---

## 📋 REVIEW CHECKLIST

### Before Starting Work
- [ ] `git worktree list` — check for stale worktrees
- [ ] `git branch` — check for old feature branches
- [ ] For each stale worktree: check `git log main..<branch>` and `git status` — ask user before cleanup
- [ ] `git worktree add ../illusions-work-<name> -b feature/<name>`

### Before Committing
- [ ] On feature branch (not main)
- [ ] Atomic commits (unrelated changes split)
- [ ] Conventional Commits format with issue reference
- [ ] All code/docs in English or Japanese only
- [ ] All user-facing text in Japanese
- [ ] No hardcoded secrets
- [ ] No memory leaks or unnecessary re-renders
- [ ] TypeScript strict mode passes (`npx tsc --noEmit`)
- [ ] Using StorageService (not custom storage)
- [ ] React hooks dependency arrays correct

### After Completing Work
- [ ] Merge feature branch to main via PR
- [ ] `git worktree remove ../illusions-work-<name>`
- [ ] `git branch -d feature/<name>`
- [ ] `git worktree list` — only main worktree remains

### Priority Levels

1. **Critical (Must Fix)**: Working on main, security vulnerabilities, language violations, missing Japanese UI
2. **High Priority**: Performance issues, memory leaks, type safety issues, not using StorageService
3. **Medium Priority**: Code style inconsistencies, missing optimizations
4. **Low Priority**: Japanese phrasing improvements, minor refactoring

> Note: Users may communicate with agents in any language. Do NOT instruct users to use English or Japanese.

---

## 🔴 PM WORKFLOW - Multi-Agent Task Coordination (CRITICAL)

The lead agent acts as **Project Manager (PM)**. It does NOT write code directly for feature work. Instead, it plans, creates GitHub sub-issues, and dispatches specialist agents to implement each sub-issue in parallel.

### Phase 1: Planning & Issue Decomposition
1. Read the parent GitHub issue to understand full scope.
2. Explore the codebase to identify affected files, dependencies, and patterns.
3. Decompose work into independent sub-issues (aim for parallelizable units).
4. Create sub-issues on GitHub under the parent issue:
   - Title: English or Japanese (per language rules)
   - Body: Detailed spec with affected files, acceptance criteria, code snippets
   - Label: same as parent issue
   - Reference parent: "Part of #<parent>" in the body
5. **Wait for user approval** before dispatching agents.

### Phase 2: Agent Dispatch
1. Create a single feature branch from `main` for the entire parent issue.
2. Dispatch agents in parallel using the Task tool:
   - Each agent receives: sub-issue number, full spec, branch name, file list
   - Agents work on **non-overlapping files** to avoid merge conflicts
   - If two sub-issues touch the same file, they must be sequenced (blocked)
3. Each agent must:
   - Work on the designated feature branch
   - Make atomic commits referencing the sub-issue (`feat: ... #<sub-issue>`)
   - Run `npx tsc --noEmit` before finishing
   - NOT touch files outside its assigned scope

### Phase 3: Integration & Verification
1. PM reviews all agent outputs (commits, TypeScript check).
2. Run final verification: `npx tsc --noEmit` on the feature branch.
3. Create PR referencing the parent issue: `Closes #<parent>`.
4. Verify all sub-issues are closed by agents.

### Sub-Issue Template
```markdown
## Summary
<1-2 sentence description>

Part of #<parent-issue-number>

## Affected Files
| File | Action | Purpose |
|------|--------|---------|
| `path/to/file.ts` | MODIFY | Description |

## Detailed Spec
<Exact changes needed, including code snippets where helpful>

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] `npx tsc --noEmit` passes with zero errors

## Dependencies
- Blocked by: #<issue> (if any)
- Blocks: #<issue> (if any)
```

### Rules for Agents
- **DO NOT** create new files unless the sub-issue explicitly requires it
- **DO NOT** modify files outside the sub-issue scope
- **DO** follow all CLAUDE.md rules (language, TypeScript strict, etc.)
- **DO** make atomic commits with sub-issue references
- **DO** run TypeScript check before reporting completion
- **DO** close the assigned sub-issue immediately upon completion — use `gh issue close <number> --comment "..."` with acceptance criteria confirmation

### Rules for PM
- **DO NOT** write implementation code directly; delegate to agents
- **DO** review agent output and catch cross-cutting issues
- **DO** sequence dependent sub-issues (use `blockedBy` / `blocks`)
- **DO** create the feature branch before dispatching agents
- **DO** wait for user approval after creating sub-issues

---

## 🎯 QUICK COMMANDS

```bash
# Check for stale worktrees and branches
git worktree list
git branch | grep -E "feature/|feat/|work/"

# Create worktree + feature branch
git worktree add ../illusions-work-my-feature -b feature/my-feature
cd ../illusions-work-my-feature

# Commit (stage specific files only)
git add src/specific-file.ts
git commit -m "feat: add specific feature (#123)"

# Merge and cleanup (from main worktree)
cd /path/to/illusions
git worktree remove ../illusions-work-my-feature
git branch -d feature/my-feature

# Language compliance check
grep -r "[\u4e00-\u9fff]" src/   # Chinese
grep -r "[\uac00-\ud7af]" src/   # Korean
```

**Key file references:**
- Storage docs: `docs/architecture/storage-system.md`
- MDI syntax: `MDI.md`
- Electron types: `types/electron.d.ts`

---

**Version**: 2.4.0 | **Last Updated**: 2026-03-19 | **Status**: ✅ Production
