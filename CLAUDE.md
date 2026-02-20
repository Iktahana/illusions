# illusions Project - AI Agent Rules
# ====================================
# Single source of truth for all AI assistants (Cursor, Claude, etc.)
# Last updated: 2026-02-06
#
# IMPORTANT: Documentation and code must use English or Japanese only.
# Communication with agents can use any language.

# ============================================================================
# 🔴 CRITICAL RULES - MUST FOLLOW (Non-negotiable)
# ============================================================================

## 1. Language Standards (CRITICAL - STRICTLY ENFORCED)
# ----------------------------------------------------------------------------

### ❌ STRICTLY FORBIDDEN in Code/Documentation:
- **Chinese (中文/中国語)** - ABSOLUTELY PROHIBITED
- **Korean (한국어/韓国語)** - ABSOLUTELY PROHIBITED
- **Any other languages** except English and Japanese

### ✅ ALLOWED Languages:
- **English**: Preferred for code logic (variables, functions, types, comments)
- **Japanese (日本語)**: Required for UI strings, allowed for comments and user-facing documentation

### Where This Policy Applies (Code/Documentation):
- ✅ Code logic: Variable names, function names, class names
- ✅ Code comments: All inline comments and block comments in source files
- ✅ Documentation files: README, API docs, technical specs
- ✅ String literals: UI text, error messages, log messages
- ✅ JSDoc: Function documentation and type annotations
- ✅ Configuration: Config files, JSON data, YAML files

### ✅ ALLOWED in AI Conversations & Planning:
- AI assistant responses (可以用中文回复用户)
- Project planning documents
- Internal notes and discussions
- Design documents and specifications

### UI/UX Language Requirements:
- **ALL user-facing text MUST be in Japanese**
- This includes:
    - Menu items (macOS Application menu, File, Edit, View, Window, Help)
    - Dialog boxes and notifications
    - Buttons, labels, placeholders, tooltips
    - Error messages shown to users
    - Update notifications

### Standard UI Translations:
- File → ファイル
- Edit → 編集
- View → 表示
- Save → 保存
- Open → 開く
- Close → 閉じる
- Quit → を終了
- Word Count → 文字数
- Paragraph Count → 段落数
- Reading Time → 読了時間

## 2. Git Worktree Isolation (CRITICAL - STRICTLY ENFORCED)
# ----------------------------------------------------------------------------

### Every task MUST use a dedicated git worktree
- **DO NOT** work directly on the main branch worktree for feature/fix tasks
- **DO** create a new worktree + branch for each task before writing any code
- **DO** clean up (remove) the worktree and delete the branch after merging

### Workflow
```bash
# 1. Create worktree with a new feature branch
git worktree add ../illusions-work-<short-name> -b feature/<branch-name>
cd ../illusions-work-<short-name>

# 2. Do all implementation work inside the worktree
#    (commits, builds, tests, etc.)

# 3. After merging to main, clean up
cd /path/to/illusions          # return to main worktree
git worktree remove ../illusions-work-<short-name>
git branch -d feature/<branch-name>
```

### Rules
- One worktree per task — do NOT reuse worktrees across unrelated tasks
- Worktree directory naming convention: `illusions-work-<short-name>`
- Always verify the worktree is removed after merge (`git worktree list`)
- If a worktree is left behind from a previous session, ask the user before cleaning up

# ============================================================================
# 🟡 HIGH PRIORITY RULES
# ============================================================================

## 4. TypeScript & Code Style Standards
# ----------------------------------------------------------------------------

### TypeScript Requirements
- **Strict Mode**: All files must work with TypeScript strict mode enabled
- **Type Safety**: Avoid `any` types unless absolutely necessary; prefer `unknown` or specific types
- **Type Imports**: Use `import type` for type-only imports
- **Explicit Return Types**: Public functions should have explicit return types

### Naming Conventions
- **Components/Classes**: PascalCase (e.g., `EditorComponent`, `StorageManager`)
- **Functions/Variables**: camelCase (e.g., `handleClick`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`, `DEFAULT_FONT_SIZE`)
- **Types/Interfaces**: PascalCase with descriptive names (e.g., `EditorProps`, `FileMetadata`)
- **Files**:
    - kebab-case for utilities (e.g., `use-mdi-file.ts`)
    - PascalCase for components (e.g., `Editor.tsx`)

### Import Order
1. External libraries (React, Next.js, etc.)
2. Internal packages (@/)
3. Relative imports (./)
4. Types (import type)

### Code Organization
- **Comments**: Use JSDoc for public functions and complex logic
- **Component Structure**: Props interface → Component → Helper functions → Exports
- **Early Returns**: Use early returns to reduce nesting

## 5. React Best Practices
# ----------------------------------------------------------------------------

### Component Standards
- **Functional Components**: Prefer function components over class components
- **Hooks Rules**: Follow React hooks rules (no conditional hooks, proper dependencies)
- **Event Handlers**: Name with `handle` prefix (e.g., `handleClick`, `handleChange`)
- **Props Destructuring**: Destructure props in function parameters for clarity

### Performance Optimization
- **Hooks Dependencies**: Verify `useEffect`, `useCallback`, `useMemo` dependency arrays are complete and correct
- **Unnecessary Re-renders**: Check for missing `React.memo`, `useCallback`, or `useMemo` optimizations
- **Memory Leaks**:
    - Ensure event listeners are cleaned up in `useEffect` return functions
    - Check for proper subscription cleanup (IPC listeners, timers, observers)
- **Infinite Loops**: Detect potential infinite re-render cycles

## 6. Security Standards
# ----------------------------------------------------------------------------

### Critical Security Checks
- **Sensitive Data**: Never hardcode API keys, passwords, tokens, or credentials
- **Electron IPC Security**:
    - Verify `contextIsolation: true` in preload configuration
    - Check `nodeIntegration: false` in BrowserWindow
    - Validate all IPC message handlers for input sanitization
    - Review `preload.js` for potential security vulnerabilities
- **XSS Prevention**: Check for unsafe DOM manipulation, `dangerouslySetInnerHTML`, or unescaped user input
- **Code Injection**: Detect use of `eval()`, `Function()`, or dynamic script execution
- **File System Access**: Ensure proper validation of file paths in Electron main process
- **External Dependencies**: Flag suspicious or unmaintained npm packages

# ============================================================================
# 🟢 PROJECT-SPECIFIC RULES
# ============================================================================

## 7. Storage Service (CRITICAL - ALWAYS USE)
# ----------------------------------------------------------------------------

### Storage Service is Mandatory
**DO NOT implement your own storage logic. ALWAYS use the unified StorageService.**

### Quick Start
```typescript
import { getStorageService } from "@/lib/storage-service";

const storage = getStorageService();

// Save session
await storage.saveSession({
  appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
  recentFiles: [],
  editorBuffer: { content: "...", timestamp: Date.now() }
});

// Load session
const session = await storage.loadSession();
```

### 12 Core Methods
- **Session**: `saveSession()`, `loadSession()`
- **App State**: `saveAppState()`, `loadAppState()`
- **Recent Files**: `addToRecent()`, `getRecentFiles()`, `removeFromRecent()`, `clearRecent()`
- **Editor Buffer**: `saveEditorBuffer()`, `loadEditorBuffer()`, `clearEditorBuffer()`
- **Utility**: `clearAll()`

### Storage Locations
- **Electron**: SQLite at `~/Library/Application Support/illusions/illusions-storage.db`
- **Web**: Browser IndexedDB via Dexie

### What NOT to Do
- ❌ Do NOT implement custom storage logic in each component
- ❌ Do NOT use localStorage directly for persistence in Electron
- ❌ Do NOT manually interact with IndexedDB
- ❌ Do NOT directly manage SQLite

### What to Do Instead
- ✅ Always use `getStorageService()`
- ✅ Use unified API for read/write
- ✅ Let the service handle environment detection
- ✅ Save editor buffer periodically (every 30 seconds)

### Common Patterns

**Pattern 1: Restore on Startup**
```typescript
useEffect(() => {
  const restore = async () => {
    const storage = getStorageService();
    const session = await storage.loadSession();
    
    if (session?.appState.lastOpenedMdiPath) {
      await openFile(session.appState.lastOpenedMdiPath);
    }
    
    if (session?.editorBuffer) {
      restoreContent(session.editorBuffer.content);
    }
  };
  
  void restore();
}, []);
```

**Pattern 2: Auto-save Editor Buffer**
```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now(),
    });
  }, 30000); // Every 30 seconds
  
  return () => clearInterval(interval);
}, [editorContent]);
```

**Pattern 3: Update State on Save**
```typescript
async function saveFile(path: string, content: string) {
  const storage = getStorageService();
  
  // Save to filesystem...
  
  // Update recent files
  await storage.addToRecent({
    name: path.split("/").pop()!,
    path,
    lastModified: Date.now(),
    snippet: content.substring(0, 100),
  });
  
  // Update app state
  await storage.saveAppState({ lastOpenedMdiPath: path });
  
  // Clear draft buffer
  await storage.clearEditorBuffer();
}
```

### Documentation References
- Quick nav: `docs/STORAGE_INDEX.md`
- Integration: `docs/STORAGE_INTEGRATION.md`
- API reference: `docs/STORAGE_QUICK_REFERENCE.md`
- Architecture: `docs/STORAGE_ARCHITECTURE.md`
- Electron checklist: `docs/ELECTRON_INTEGRATION_CHECKLIST.md`
- Code examples: `lib/storage-service-examples.ts`

## 8. Electron-Specific Rules
# ----------------------------------------------------------------------------

### IPC Communication
- Use typed IPC channels defined in `types/electron.d.ts`
- Always validate input in IPC handlers
- Use `contextIsolation: true` and `nodeIntegration: false`

### File Operations
- Always use Electron's dialog API for file selection
- Validate file paths before filesystem operations

### Storage
- Use StorageService abstraction (`electron-storage.ts`)
- Do NOT use localStorage for persistence

## 9. Next.js-Specific Rules
# ----------------------------------------------------------------------------

### Component Types
- **Client Components**: Mark with `"use client"` when using browser APIs or React hooks
- **Server Components**: Default to server components when possible
- **Dynamic Imports**: Use Next.js dynamic imports for code splitting

## 10. Milkdown Plugin Development
# ----------------------------------------------------------------------------

### Plugin Structure
- Follow the established pattern in `packages/milkdown-plugin-japanese-novel/`
- Properly type ProseMirror schemas and plugins
- Use proper tokenization with kuromoji for Japanese text processing

### MDI Syntax
- When editing or generating `.mdi` content, follow the syntax rules defined in `MDI.md` at the repo root

## 11. Performance Standards
# ----------------------------------------------------------------------------

### General Performance
- **Heavy Computations**: Flag expensive operations that should be memoized or moved to workers
- **Large Bundle Size**: Check for unnecessary imports or large libraries
- **Database Operations**: Review IndexedDB (Dexie) queries for efficiency

# ============================================================================
# 🔵 WORKFLOW & COLLABORATION RULES
# ============================================================================

## 12. Token Usage Optimization
# ----------------------------------------------------------------------------

### Read Files Selectively
- ❌ DO NOT read entire codebase or directory tree without specific need
- ✅ Only read files that are directly relevant to the current task
- ✅ Use `Grep` to search for specific patterns before reading files
- ✅ Use `offset` and `limit` parameters when reading large files

### Tool Selection
- Prefer `Grep` over reading multiple files to find specific code
- Use `Glob` to find files by pattern, then selectively read
- Avoid using `Read` on generated files (dist/, out/, node_modules/, .next/)

### Context Management
- Only include necessary context in responses
- Avoid repeating unchanged code snippets
- Be concise in explanations unless user asks for details

## 13. Commit Message Standards
# ----------------------------------------------------------------------------

### Conventional Commits Format
All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Issue References
**CRITICAL**: If your commit relates to a GitHub Issue, you MUST include the issue number:

- **General reference**: `feat: add feature (#123)`
- **Closes issue**: `fix: resolve bug (closes #456)` or `fix: resolve bug (fixes #456)`
- **Part of larger issue**: `feat: implement component (part of #789)`
- **Multiple issues**: `refactor: update API (relates to #100, #101)`

### Examples

**Good commit messages**:
```
feat: add glassmorphism to all dialogs (#234)

- Create reusable GlassDialog component
- Refactor 7 dialog components to use GlassDialog
- Apply frosted glass effect with backdrop-blur-xl

Closes #234

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

```
fix: prevent infinite loop in search (fixes #567)

The search was triggering re-renders on every keystroke.
Added debounce with 300ms delay.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**When NOT to reference issues**:
- Trivial commits (typo fixes, formatting)
- Internal refactoring without user-facing changes
- Documentation updates (unless issue specifically requests it)
- Dependency updates (unless fixing a specific issue)

### Commit Types
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (deps, config)

## 14. Testing Standards (Future)
# ----------------------------------------------------------------------------

### Test Coverage
- **Unit Tests**: All utility functions should have unit tests
- **Component Tests**: Critical components should have integration tests
- **E2E Tests**: Main user flows should have E2E tests

# ============================================================================
# 📋 REVIEW CHECKLIST
# ============================================================================

## Before Starting Work (Every Time!)
- [ ] **Check for stale worktrees**: Run `git worktree list` to find leftover worktrees
- [ ] **Check for old branches**: Run `git branch` to find feature branches
- [ ] **Ask user if cleanup needed**: If old worktrees/branches exist, ask user before proceeding
- [ ] **Create a new worktree**: `git worktree add ../illusions-work-<name> -b feature/<name>`

## Before Committing (Every Time!)
- [ ] **Working on feature branch**: Not committing directly to main
- [ ] **Atomic commits**: Did I split unrelated changes into separate commits?
- [ ] **Commit messages**: Did I use Conventional Commits format?
- [ ] **Issue references**: If this commit relates to a GitHub Issue, did I include the issue number (e.g., `feat: add feature (#123)` or `fix: resolve bug (fixes #456)`)?
- [ ] **Language check**: Are all code/docs in English or Japanese only?
- [ ] **UI language**: Is all user-facing text in Japanese?
- [ ] **Security**: No hardcoded secrets or vulnerabilities?
- [ ] **Performance**: No memory leaks or unnecessary re-renders?
- [ ] **TypeScript**: All types properly defined?
- [ ] **Storage**: Using StorageService instead of custom logic?
- [ ] **React hooks**: Dependencies correct?
- [ ] **Code style**: Following naming conventions?

## After Completing Work (Every Time!)
- [ ] **Merge to main**: Merge feature branch to main
- [ ] **Remove worktree**: `git worktree remove ../illusions-work-<name>`
- [ ] **Delete feature branch**: `git branch -d feature/<name>`
- [ ] **Verify cleanup**: Run `git worktree list` — only the main worktree should remain

## Priority Levels
1. **Critical (Must Fix)**:
    - Working directly on main branch for new features
    - Atomic commit violations
    - Not checking for old branches/directories before starting
    - Security vulnerabilities
    - Language violations (Chinese/Korean in code)
    - Missing Japanese in UI
    - User can use any language when communicating with the agent.
    - Don't teach users to speak English or Japanese.

2. **High Priority**:
    - Performance issues with user impact
    - Memory leaks
    - Type safety issues
    - Not using StorageService

3. **Medium Priority**:
    - Code style inconsistencies
    - Missing optimizations

4. **Low Priority/Suggestions**:
    - Japanese phrasing improvements
    - Minor refactoring opportunities

# ============================================================================
# 🔴 PM WORKFLOW - Multi-Agent Task Coordination (CRITICAL)
# ============================================================================

## Overview
# The lead agent acts as **Project Manager (PM)**. It does NOT write code directly
# for feature work. Instead, it plans, creates GitHub sub-issues, and dispatches
# specialist agents to implement each sub-issue in parallel.

## Workflow Steps

### Phase 1: Planning & Issue Decomposition
1. **Read the parent GitHub issue** to understand the full scope.
2. **Explore the codebase** to identify affected files, dependencies, and patterns.
3. **Decompose** the work into independent sub-issues (aim for parallelizable units).
4. **Create sub-issues on GitHub** under the parent issue:
   - Title: English or Japanese (per language rules).
   - Body: Detailed spec including affected files, acceptance criteria, and code snippets.
   - Label: same as parent issue.
   - Reference parent: "Part of #<parent>" in the body.
5. **Wait for user approval** before dispatching agents.

### Phase 2: Agent Dispatch
1. **Create a single feature branch** from `main` for the entire parent issue:
   ```
   git checkout -b feature/<parent-issue-slug>
   ```
2. **Dispatch agents in parallel** using the Task tool:
   - Each agent receives: sub-issue number, full spec, branch name, file list.
   - Agents work on **non-overlapping files** to avoid merge conflicts.
   - If two sub-issues touch the same file, they must be sequenced (blocked).
3. **Each agent must**:
   - Work on the designated feature branch.
   - Make atomic commits referencing the sub-issue number (`feat: ... #<sub-issue>`).
   - Run `npx tsc --noEmit` before finishing to verify zero errors.
   - NOT touch files outside its assigned scope.

### Phase 3: Integration & Verification
1. **PM reviews** all agent outputs (commits, TypeScript check).
2. **Run final verification**: `npx tsc --noEmit` on the feature branch.
3. **Create PR** referencing the parent issue: `Closes #<parent>`.
4. **Close sub-issues** with verification comments.

## Sub-Issue Template
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

## Rules for Agents
- **DO NOT** create new files unless the sub-issue explicitly requires it.
- **DO NOT** modify files outside the sub-issue scope.
- **DO** follow all existing CLAUDE.md rules (language, TypeScript strict, etc.).
- **DO** make atomic commits with sub-issue references.
- **DO** run TypeScript check before reporting completion.

## Rules for PM
- **DO NOT** write implementation code directly; delegate to agents.
- **DO** review agent output and catch cross-cutting issues.
- **DO** sequence dependent sub-issues (use `blockedBy` / `blocks`).
- **DO** create the feature branch before dispatching agents.
- **DO** wait for user approval after creating sub-issues.

# ============================================================================
# 🎯 QUICK REFERENCE
# ============================================================================

## Most Common Mistakes to Avoid
1. ❌ Not using a dedicated git worktree for each task
2. ❌ Not cleaning up worktrees/branches after merging
3. ❌ Working directly on main branch for new features
4. ❌ Using `git add .` instead of staging files individually
5. ❌ Grouping unrelated changes into one commit
6. ❌ Using Chinese/Korean in code, comments, or commit messages
7. ❌ Not translating UI text to Japanese
8. ❌ Implementing custom storage logic instead of using StorageService
9. ❌ Using `any` type in TypeScript
10. ❌ Forgetting to clean up event listeners in `useEffect`
11. ❌ Missing dependency arrays in React hooks

## File Locations for Reference
- Code review standards: `CLAUDE.md`
- Quick guide: `AI_RULES_GUIDE.md`
- Storage documentation: `docs/STORAGE_INDEX.md`
- Electron integration: `docs/ELECTRON_INTEGRATION_CHECKLIST.md`

## Quick Commands Reference
```bash
# Check for stale worktrees
git worktree list

# Check for old branches
git branch | grep -E "feature/|feat/|work/"

# Create worktree + feature branch (standard workflow)
git worktree add ../illusions-work-my-feature -b feature/my-feature
cd ../illusions-work-my-feature

# Good commit workflow
git add src/specific-file.ts
git commit -m "feat: add specific feature"

# Merge and cleanup (from main worktree)
cd /path/to/illusions
git merge feature/my-feature
git worktree remove ../illusions-work-my-feature
git branch -d feature/my-feature

# Check language compliance
grep -r "[\u4e00-\u9fff]" src/  # Chinese check
grep -r "[\uac00-\ud7af]" src/  # Korean check
```

---

**Version**: 2.3.0
**Last Updated**: 2026-02-20
**Status**: ✅ Production - All AI agents must follow these rules
**Changes in 2.3.0**:
- Added Git Worktree Isolation rule (CRITICAL) — every task must use a dedicated worktree
- Updated checklists and quick commands to reflect worktree workflow
**Changes in 2.2.0**:
- Added PM Workflow section for multi-agent task coordination
- Defined sub-issue template, agent rules, and PM rules
- Established Phase 1 (Planning) → Phase 2 (Dispatch) → Phase 3 (Integration) workflow
**Changes in 2.1.1**:
- Clarified language policy applies to GitHub Issues and Pull Requests
- Added requirement: Issue/PR titles and descriptions must be English or Japanese only
  **Changes in 2.1.0**:
- Added Branch & Directory Management rule (CRITICAL)
- Added pre-work checklist for old branches/directories
- Added cleanup requirements after merge
- Clarified language policy in header
