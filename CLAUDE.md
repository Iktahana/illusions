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

---

### 2. Branch Strategy & Release Cadence

**Branch model:**

```
feature/<name>  →  dev  →  (weekly PR, every Monday)  →  main
hotfix/<name>   →  main  (emergency only, then cherry-pick to dev)
```

- **`main`**: production branch — receives merges only via weekly release PR
- **`dev`**: integration branch — all feature/fix PRs target `dev` (not `main`)
- **Weekly release**: every Monday 09:00 JST, a GitHub Actions workflow auto-creates a `dev → main` PR; human merges it
- **Hotfix**: branch from `main`, merge directly to `main` for immediate release, then `git cherry-pick` or `git merge main` into `dev`

### 3. Git Worktree Isolation

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

# 3. After completing work, clean up
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
await storage.saveSession({
  appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
  recentFiles: [],
  editorBuffer: { content: "...", timestamp: Date.now() },
});
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
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

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
- [ ] Conventional Commits format
- [ ] All code/docs in English or Japanese only
- [ ] All user-facing text in Japanese
- [ ] No hardcoded secrets
- [ ] No memory leaks or unnecessary re-renders
- [ ] TypeScript strict mode passes (`npx tsc --noEmit`)
- [ ] Using StorageService (not custom storage)
- [ ] React hooks dependency arrays correct

### After Completing Work

- [ ] `git worktree remove ../illusions-work-<name>`
- [ ] `git branch -d feature/<name>`
- [ ] `git worktree list` — only main worktree remains

### Priority Levels

1. **Critical (Must Fix)**: Working on main, security vulnerabilities, language violations, missing Japanese UI
2. **High Priority**: Performance issues, memory leaks, type safety issues, not using StorageService
3. **Medium Priority**: Code style inconsistencies, missing optimizations
4. **Low Priority**: Japanese phrasing improvements, minor refactoring

> Note: Users may communicate with agents in any language. Do NOT instruct users to use English or Japanese.

**Key file references:**

### Component Responsibility Map

| Component / Hook                      | Responsible For                                                  |
| ------------------------------------- | ---------------------------------------------------------------- |
| `app/page.tsx`                        | Top-level coordinator — wires all hooks to EditorLayout          |
| `components/EditorLayout.tsx`         | Layout structure only; no business logic                         |
| `components/Editor.tsx`               | Milkdown editor instance and ProseMirror bridge                  |
| `lib/editor-page/use-linting.ts`      | RuleRunner lifecycle and lint state management                   |
| `lib/editor-page/use-file-opening.ts` | Open/save file dialogs and IPC calls                             |
| `lib/storage/storage-service.ts`      | Storage singleton with environment detection                     |
| `lib/vfs/`                            | Filesystem abstraction (browser File API vs Node.js fs)          |
| `electron/preload.js`                 | **IPC security boundary** — sole point exposing APIs to renderer |

- Storage docs: `docs/architecture/storage-system.md`
- MDI syntax: `MDI.md`
- Electron types: `types/electron.d.ts`
