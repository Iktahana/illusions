# Illusions Project - Code Review Standards

This document defines the code review standards for the Illusions project, a Japanese novel editor built with Electron, Next.js, React, and TypeScript.

## 🔒 Security Review

### Critical Security Checks
- **Sensitive Data**: Check for hardcoded API keys, passwords, tokens, or credentials
- **Electron IPC Security**: 
  - Verify `contextIsolation: true` in preload configuration
  - Check `nodeIntegration: false` in BrowserWindow
  - Validate all IPC message handlers for input sanitization
  - Review `preload.js` for potential security vulnerabilities
- **XSS Prevention**: Check for unsafe DOM manipulation, `dangerouslySetInnerHTML`, or unescaped user input
- **Code Injection**: Detect use of `eval()`, `Function()`, or dynamic script execution
- **File System Access**: Ensure proper validation of file paths in Electron main process
- **External Dependencies**: Flag suspicious or unmaintained npm packages

## ⚡ Performance Review

### React Performance
- **Hooks Dependencies**: Verify `useEffect`, `useCallback`, `useMemo` dependency arrays are complete and correct
- **Unnecessary Re-renders**: Check for missing `React.memo`, `useCallback`, or `useMemo` optimizations
- **Memory Leaks**: 
  - Ensure event listeners are cleaned up in `useEffect` return functions
  - Check for proper subscription cleanup (IPC listeners, timers, observers)
- **Infinite Loops**: Detect potential infinite re-render cycles

### General Performance
- **Heavy Computations**: Flag expensive operations that should be memoized or moved to workers
- **Large Bundle Size**: Check for unnecessary imports or large libraries
- **Database Operations**: Review IndexedDB (Dexie) queries for efficiency

## 🌐 Language Standards (Critical)

### Code & Documentation Language Policy

**❌ STRICTLY FORBIDDEN in Code/Documentation:**
- Chinese (中文/中国語)
- Korean (한국어/韓国語)
- Any other languages except English and Japanese

**Where This Policy Applies (Code/Documentation):**
- ✅ **Code logic**: Variable names, function names, class names
- ✅ **Code comments**: All inline comments and block comments in source files
- ✅ **Documentation files**: README, CONTRIBUTING, API docs, technical specs
- ✅ **String literals**: UI text, error messages, log messages
- ✅ **JSDoc**: Function documentation and type annotations
- ✅ **Configuration**: Config files, JSON data, YAML files
- ✅ **Commit messages**: Git commit messages and PR descriptions

**✅ ALLOWED in AI Conversations & Planning:**
- AI assistant responses (可以用中文回复)
- Project planning documents (计划书可以用中文)
- Internal notes and discussions (内部讨论可以用中文)
- Design documents and specifications (设计文档可以用中文)

### Allowed Languages for Code/Documentation
- ✅ **English**: Preferred for code logic (variables, functions, types)
- ✅ **Japanese (日本語)**: Allowed for UI strings, comments, and user-facing documentation

### Japanese Quality Check (Advisory)
When Japanese text is present, provide **suggestions** (not strict requirements) on:
- **Naturalness**: Does the Japanese read naturally for native speakers?
- **Professionalism**: Is the tone appropriate for a professional application?
- **Consistency**: Are similar concepts expressed using consistent terminology?
- **Grammar**: Are particles (は, が, を, に, etc.) used correctly?

**Note**: These are recommendations to improve quality, not blocking issues.

## 📝 Code Style Standards

### TypeScript
- **Strict Mode**: All files should work with TypeScript strict mode enabled
- **Type Safety**: Avoid `any` types unless absolutely necessary; prefer `unknown` or specific types
- **Type Imports**: Use `import type` for type-only imports
- **Explicit Return Types**: Public functions should have explicit return types

### Naming Conventions
- **Components/Classes**: PascalCase (e.g., `EditorComponent`, `StorageManager`)
- **Functions/Variables**: camelCase (e.g., `handleClick`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`, `DEFAULT_FONT_SIZE`)
- **Types/Interfaces**: PascalCase with descriptive names (e.g., `EditorProps`, `FileMetadata`)
- **Files**: kebab-case for utilities, PascalCase for components (e.g., `use-mdi-file.ts`, `Editor.tsx`)

### Code Organization
- **Imports Order**: 
  1. External libraries (React, Next.js, etc.)
  2. Internal packages (@/)
  3. Relative imports (./)
  4. Types (import type)
- **Comments**: Use JSDoc for public functions and complex logic
- **Component Structure**: Props interface → Component → Helper functions → Exports

### React Best Practices
- **Functional Components**: Prefer function components over class components
- **Hooks Rules**: Follow React hooks rules (no conditional hooks, proper dependencies)
- **Event Handlers**: Name with `handle` prefix (e.g., `handleClick`, `handleChange`)
- **Props Destructuring**: Destructure props in function parameters for clarity
- **Early Returns**: Use early returns to reduce nesting

## 🎯 Project-Specific Standards

### Electron-Specific
- **IPC Communication**: Use typed IPC channels defined in `types/electron.d.ts`
- **File Operations**: Always use Electron's dialog API for file selection
- **Storage**: Use proper storage abstraction (`electron-storage.ts` or `web-storage.ts`)

### Next.js-Specific
- **Client Components**: Mark with `"use client"` when using browser APIs or React hooks
- **Server Components**: Default to server components when possible
- **Dynamic Imports**: Use Next.js dynamic imports for code splitting

### Milkdown Plugin Development
- **Plugin Structure**: Follow the established pattern in `packages/milkdown-plugin-japanese-novel/`
- **ProseMirror**: Properly type ProseMirror schemas and plugins
- **Japanese Text Processing**: Use proper tokenization with kuromoji

### Testing (Future)
- **Unit Tests**: All utility functions should have unit tests
- **Component Tests**: Critical components should have integration tests
- **E2E Tests**: Main user flows should have E2E tests

## 🚨 Review Output Format

When reviewing PRs, structure findings as follows:

```markdown
## Security Issues
- [ ] **[CRITICAL/HIGH/MEDIUM/LOW]** Description of issue
  - **Location**: `file.ts:123`
  - **Reason**: Explanation
  - **Suggestion**: How to fix

## Performance Issues
- [ ] **[HIGH/MEDIUM/LOW]** Description of issue
  - **Location**: `file.ts:123`
  - **Impact**: Performance impact
  - **Suggestion**: Optimization approach

## Language Violations
- [ ] **[CRITICAL]** Non-English/Japanese language detected
  - **Location**: `file.ts:123`
  - **Found**: "禁止的語言文字"
  - **Required Action**: Replace with English or Japanese

## Japanese Quality Suggestions (Advisory)
- 💡 **[SUGGESTION]** Japanese phrasing improvement
  - **Location**: `file.ts:123`
  - **Current**: "現在の表現"
  - **Suggested**: "より自然な表現"
  - **Reason**: Explanation in Japanese or English

## Code Style Issues
- [ ] **[MEDIUM/LOW]** Description of style issue
  - **Location**: `file.ts:123`
  - **Expected**: Expected pattern
  - **Suggestion**: How to align with standards

## Summary
- ✅ **Approved** / ⚠️ **Needs Changes** / 🚫 **Blocked**
- **Critical Issues**: X
- **High Priority**: X
- **Medium/Low**: X
- **Suggestions**: X
```

## 📋 Review Priorities

1. **Critical (Must Fix)**: Security vulnerabilities, language violations (non-English/Japanese)
2. **High Priority**: Performance issues with user impact, memory leaks, type safety issues
3. **Medium Priority**: Code style inconsistencies, missing optimizations
4. **Low Priority/Suggestions**: Japanese phrasing improvements, minor refactoring opportunities

## ✅ Review Checklist

For every PR, verify:
- [ ] No security vulnerabilities introduced
- [ ] No Chinese, Korean, or other prohibited languages in code/comments/strings
- [ ] No performance regressions or memory leaks
- [ ] TypeScript types are properly defined
- [ ] Code follows established naming conventions
- [ ] React hooks have correct dependencies
- [ ] Electron IPC calls are secure and typed
- [ ] Comments and documentation are clear
- [ ] Japanese text is natural and professional (advisory)

---

**Note**: This document should evolve with the project. Update standards as new patterns emerge or requirements change.
