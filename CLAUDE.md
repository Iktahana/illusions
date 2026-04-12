# illusions Project - AI Agent Rules

> Code and documentation: **English or Japanese only**. All UI text: **Japanese**.
> Chinese, Korean, and other languages are forbidden in code/docs. Agent conversations may use any language.

---

## 1. Language

- **Code** (variables, functions, types, comments, JSDoc, configs): English preferred, Japanese allowed
- **UI strings** (menus, dialogs, buttons, labels, tooltips, errors, notifications): Japanese required

## 2. Branch Strategy

```
feature/<name>  →  dev  →  (weekly Monday release)  →  main
hotfix/<name>   →  main  (emergency, then cherry-pick to dev)
```

- `main`: production — merges only via weekly release PR
- `dev`: integration — all feature/fix PRs target `dev`
- Weekly release: Monday 09:00 JST, GH Actions auto-creates `dev → main` PR
- Hotfix: branch from `main`, merge to `main`, cherry-pick to `dev`

## 3. Git Worktree Isolation

Every task uses a dedicated worktree. One per task, clean up after merge.

- Naming: `../illusions-work-<short-name>` with branch `feature/<name>`
- Before removing: check `git log main..<branch>` and `git status` for unmerged/uncommitted work
- After merge: `git worktree remove` + `git branch -d` + verify with `git worktree list`

## 4. TypeScript & Code Style

- Strict mode, no `any` (use `unknown`), `import type` for type-only, explicit return types on public functions

| Target                   | Convention       | Example                           |
| ------------------------ | ---------------- | --------------------------------- |
| Components/Classes/Types | PascalCase       | `EditorComponent`, `FileMetadata` |
| Functions/Variables      | camelCase        | `handleClick`, `isLoading`        |
| Constants                | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`                   |
| Utility files            | kebab-case       | `use-mdi-file.ts`                 |
| Component files          | PascalCase       | `Editor.tsx`                      |

- Import order: external → `@/` → relative → types

## 5. Security

- Never hardcode secrets (API keys, passwords, tokens)
- Electron IPC: `contextIsolation: true`, `nodeIntegration: false`, validate all inputs
- No `eval()`, `Function()`, unsafe DOM manipulation, or unescaped user input

## 6. Storage Service (CRITICAL)

**Always use the unified StorageService. Never implement custom storage.**

```typescript
import { getStorageService } from "@/lib/storage/storage-service";
const storage = getStorageService();
```

12 methods: `saveSession`, `loadSession`, `saveAppState`, `loadAppState`, `addToRecent`, `getRecentFiles`, `removeFromRecent`, `clearRecent`, `saveEditorBuffer`, `loadEditorBuffer`, `clearEditorBuffer`, `clearAll`

- Electron: SQLite at `~/Library/Application Support/illusions/illusions-storage.db`
- Web: IndexedDB via Dexie
- Auto-save editor buffer every 30 seconds

## 7. Framework Rules

- **Electron**: Typed IPC channels from `types/electron.d.ts`, validate IPC input, use `electron-storage.ts`
- **Next.js**: `"use client"` for browser APIs/hooks, default to server components, dynamic imports for splitting
- **Milkdown**: Follow patterns in `packages/milkdown-plugin-japanese-novel/`, type ProseMirror schemas, use kuromoji for tokenization, follow `MDI.md` for `.mdi` syntax

## 8. Code Review

- When Codex (or other agents) provide code reviews, you have the right to disagree with their suggestions. Evaluate each item independently — accept what makes sense, skip what doesn't, and briefly explain your reasoning for items you reject.

## 9. Commits

```
<type>(<scope>): <subject>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

## Component Map

| Component / Hook                      | Responsible For                     |
| ------------------------------------- | ----------------------------------- |
| `app/page.tsx`                        | Top-level coordinator               |
| `components/EditorLayout.tsx`         | Layout structure only               |
| `components/Editor.tsx`               | Milkdown + ProseMirror bridge       |
| `lib/editor-page/use-linting.ts`      | RuleRunner lifecycle and lint state |
| `lib/editor-page/use-file-opening.ts` | Open/save dialogs and IPC           |
| `lib/storage/storage-service.ts`      | Storage singleton                   |
| `lib/vfs/`                            | Filesystem abstraction              |
| `electron/preload.js`                 | IPC security boundary               |

Key references: `docs/architecture/storage-system.md`, `MDI.md`, `types/electron.d.ts`
