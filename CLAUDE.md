# Illusions Project - AI Agent Rules
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
- **Electron**: SQLite at `~/Library/Application Support/Illusions/illusions-storage.db`
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

## 13. Testing Standards (Future)
# ----------------------------------------------------------------------------

### Test Coverage
- **Unit Tests**: All utility functions should have unit tests
- **Component Tests**: Critical components should have integration tests
- **E2E Tests**: Main user flows should have E2E tests

# ============================================================================
# 📋 REVIEW CHECKLIST
# ============================================================================

## Before Starting Work (Every Time!)
- [ ] **Check for old branches**: Run `git branch` to find feature branches
- [ ] **Check for old directories**: Run `ls -la` to find work-* or feature-* directories
- [ ] **Ask user if cleanup needed**: If old branches/directories exist, ask user before proceeding
- [ ] **Create feature branch**: Never work directly on main for new features

## Before Committing (Every Time!)
- [ ] **Working on feature branch**: Not committing directly to main
- [ ] **Atomic commits**: Did I split unrelated changes into separate commits?
- [ ] **Commit messages**: Did I use Conventional Commits format?
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
- [ ] **Delete feature branch**: Clean up merged branches
- [ ] **Delete working directory**: Remove temporary work directories
- [ ] **Verify cleanup**: No orphaned branches or directories left

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
# 🎯 QUICK REFERENCE
# ============================================================================

## Most Common Mistakes to Avoid
1. ❌ Working directly on main branch for new features
2. ❌ Not checking for old branches/directories before starting
3. ❌ Not cleaning up branches/directories after merging
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
# Check for old branches
git branch | grep -E "feature/|feat/|work/"

# Check for old working directories  
ls -la | grep -E "work-|feature-|temp-"

# Create feature branch
git checkout -b feature/my-feature

# Good commit workflow
git add src/specific-file.ts
git commit -m "feat: add specific feature"

# Merge and cleanup
git checkout main
git merge feature/my-feature
git branch -d feature/my-feature

# Check language compliance
grep -r "[\u4e00-\u9fff]" src/  # Chinese check
grep -r "[\uac00-\ud7af]" src/  # Korean check
```

---

**Version**: 2.1.1  
**Last Updated**: 2026-02-06  
**Status**: ✅ Production - All AI agents must follow these rules
**Changes in 2.1.1**:
- Clarified language policy applies to GitHub Issues and Pull Requests
- Added requirement: Issue/PR titles and descriptions must be English or Japanese only
  **Changes in 2.1.0**:
- Added Branch & Directory Management rule (CRITICAL)
- Added pre-work checklist for old branches/directories
- Added cleanup requirements after merge
- Clarified language policy in header
