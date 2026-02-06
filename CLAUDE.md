# Illusions Project - Code Review Standards

This document defines the code review standards for the Illusions project, a Japanese novel editor built with Electron, Next.js, React, and TypeScript.

## 📖 Rule Documentation Structure

This project uses a **unified rule system**:

- **`.cursorrules`** - Single source of truth for ALL AI agents (Cursor, Claude, GitHub Copilot, etc.)
  - Contains all critical rules, coding standards, and project-specific guidelines
  - Must be read and followed by all AI assistants
  - Includes:
    - ✅ Atomic commit strategy (MANDATORY)
    - ✅ Language standards (English/Japanese only)
    - ✅ TypeScript & code style
    - ✅ React best practices
    - ✅ Security standards
    - ✅ Storage service usage
    - ✅ Electron/Next.js specific rules

- **`CLAUDE.md`** (this file) - Code review specific instructions
  - How to perform PR reviews
  - Review output format
  - Priority levels and checklist

- **`.cursor/rules/`** - Detailed reference documentation
  - Storage service details
  - Language policy explanations
  - UI guidelines
  - MDI syntax rules

**⚠️ IMPORTANT**: When performing code reviews, you MUST first read and apply ALL rules from `.cursorrules`.

## 🚨 Review Output Format

When reviewing PRs, structure findings as follows:

```markdown
## 🔴 Critical Issues (BLOCKING)
- [ ] **[CRITICAL]** Description of issue
  - **Location**: `file.ts:123`
  - **Rule Violated**: Atomic Commit / Language Policy / Security
  - **Reason**: Explanation
  - **Required Action**: How to fix

## 🟡 Security Issues
- [ ] **[HIGH/MEDIUM/LOW]** Description of issue
  - **Location**: `file.ts:123`
  - **Reason**: Explanation
  - **Suggestion**: How to fix

## ⚡ Performance Issues
- [ ] **[HIGH/MEDIUM/LOW]** Description of issue
  - **Location**: `file.ts:123`
  - **Impact**: Performance impact
  - **Suggestion**: Optimization approach

## 🌐 Language Violations
- [ ] **[CRITICAL]** Non-English/Japanese language detected
  - **Location**: `file.ts:123`
  - **Found**: "禁止的語言文字"
  - **Required Action**: Replace with English or Japanese

## 📝 Code Style Issues
- [ ] **[MEDIUM/LOW]** Description of style issue
  - **Location**: `file.ts:123`
  - **Expected**: Expected pattern
  - **Suggestion**: How to align with standards

## 💡 Japanese Quality Suggestions (Advisory)
- 💡 **[SUGGESTION]** Japanese phrasing improvement
  - **Location**: `file.ts:123`
  - **Current**: "現在の表現"
  - **Suggested**: "より自然な表現"
  - **Reason**: Explanation in Japanese or English

## ✅ Summary
- **Status**: ✅ Approved / ⚠️ Needs Changes / 🚫 Blocked
- **Critical Issues**: X (must be 0 to approve)
- **High Priority**: X
- **Medium/Low**: X
- **Suggestions**: X
```

## 📋 Review Priorities

### 1. Critical (BLOCKING - Must Fix Before Merge)
- **Branch Management Violations**:
  - Working directly on main branch for new features
  - Not checking for old branches/directories before starting
  - Not cleaning up branches/directories after merge
- **Atomic Commit Violations**:
  - Using `git add .`
  - Grouping unrelated changes in one commit
  - Missing or incorrect Conventional Commits format
- **Language Violations**: 
  - Chinese, Korean, or other prohibited languages in code/comments/commits/issues/PRs
  - Missing Japanese in user-facing UI
- **Security Vulnerabilities**: 
  - Hardcoded credentials
  - Unsafe IPC handlers
  - XSS vulnerabilities

### 2. High Priority (Should Fix Before Merge)
- Performance issues with user impact
- Memory leaks or infinite loops
- Type safety issues (excessive use of `any`)
- Not using StorageService when required
- Missing React hook dependencies

### 3. Medium Priority (Address Soon)
- Code style inconsistencies
- Missing optimizations
- Incomplete JSDoc documentation

### 4. Low Priority/Suggestions (Nice to Have)
- Japanese phrasing improvements (advisory)
- Minor refactoring opportunities
- Code organization suggestions

## ✅ Review Checklist

For every PR, verify:

### Critical Checks (MUST PASS)
- [ ] **Feature Branch**: New features are developed on feature branches, not main
- [ ] **Branch Cleanup**: Old branches are cleaned up before starting new work
- [ ] **Atomic Commits**: Each commit represents a single logical change
- [ ] **Commit Messages**: All commits use Conventional Commits format
- [ ] **No `git add .`**: Files are staged individually or in logical groups
- [ ] **Language Policy**: No Chinese, Korean, or other prohibited languages in code/comments/strings/commits/issues/PRs
- [ ] **GitHub Communication**: Issue/PR titles and descriptions are in English or Japanese only
- [ ] **UI Language**: All user-facing text is in Japanese

### High Priority Checks
- [ ] **Security**: No vulnerabilities introduced
- [ ] **Performance**: No memory leaks or performance regressions
- [ ] **TypeScript**: Types are properly defined (minimal use of `any`)
- [ ] **Storage Service**: Using unified StorageService instead of custom logic
- [ ] **React Hooks**: Dependencies are correct and complete
- [ ] **Electron IPC**: Calls are secure and typed

### Code Quality Checks
- [ ] **Code Style**: Follows established naming conventions
- [ ] **Comments**: JSDoc for public functions, clear explanations for complex logic
- [ ] **Imports**: Proper order (external → internal → relative → types)
- [ ] **Error Handling**: Proper error handling and user feedback

### Advisory Checks
- [ ] **Japanese Quality**: Text is natural and professional (suggestions only)
- [ ] **Code Organization**: Logical structure and separation of concerns
- [ ] **Performance Optimization**: Opportunities for `React.memo`, `useCallback`, `useMemo`

## 🎯 Review Focus Areas

### 1. Commit Structure Review
**Check EVERY commit individually:**
- Does each commit have a single, clear purpose?
- Are unrelated changes split into separate commits?
- Do commit messages follow the format: `type: description`?
- Were files staged individually or with `git add .`?

**Examples of Good Commits:**
```
feat: add auto-save for editor buffer
fix: resolve memory leak in IPC listener cleanup
docs: update storage service API reference
style: apply consistent formatting to editor component
refactor: extract word count logic into utility function
```

**Examples of Bad Commits (REJECT):**
```
❌ Update files (no type, no clear purpose)
❌ feat: add feature and fix bugs (multiple purposes)
❌ fix stuff (not descriptive)
❌ Changes (useless message)
```

### 2. Language Compliance Review
**Scan all changed files for:**
- Chinese characters in code/comments (禁止)
- Korean characters in code/comments (금지)
- English text in UI strings (should be Japanese)

**Common locations to check:**
- Menu labels and dialog text
- Error messages shown to users
- Button labels and tooltips
- Commit messages themselves

### 3. Storage Service Compliance
**Check if PR modifies data persistence:**
- Is it using `getStorageService()` from `@/lib/storage-service`?
- Or is it implementing custom localStorage/IndexedDB/SQLite logic? (❌ Reject)

**Red flags:**
- Direct calls to `localStorage.setItem()`
- Direct IndexedDB operations
- Custom database implementations
- File-based session storage without StorageService

### 4. Security Review
**Check for:**
- API keys or tokens in code
- Unsafe `dangerouslySetInnerHTML` usage
- Missing input validation in IPC handlers
- `eval()` or `Function()` usage
- Unescaped user input in DOM manipulation

### 5. Performance Review
**Check for:**
- Missing dependency arrays in `useEffect`, `useCallback`, `useMemo`
- Large components that should be split or memoized
- Expensive computations that aren't memoized
- Event listeners without cleanup
- Infinite re-render risks

## 🔍 How to Perform a Review

### Step 1: Read the `.cursorrules` File
Before reviewing ANY PR, read the current `.cursorrules` file to understand all active rules.

### Step 2: Review Commits (Critical!)
**Check each commit individually:**
1. View the commit message
2. Check if it follows Conventional Commits format
3. Review the files changed in that specific commit
4. Verify all changes relate to the commit message
5. Check for `git add .` usage (git log shows this)

### Step 3: Check Language Compliance
1. Scan all code changes for prohibited languages
2. Verify UI text is in Japanese
3. Check commit messages are in English or Japanese
4. Check Issue/PR titles and descriptions are in English or Japanese

### Step 4: Verify Project Standards
1. TypeScript types are proper
2. StorageService is used correctly
3. React hooks have correct dependencies
4. Security best practices are followed

### Step 5: Write Structured Review
Use the review output format above with:
- Clear priority levels
- Specific file locations
- Actionable suggestions
- Overall approval status

## 💡 Japanese Quality Guidelines (Advisory Only)

When Japanese text is present, provide **suggestions** (not strict requirements) on:

### Naturalness
- Does the Japanese read naturally for native speakers?
- Are there any awkward phrasings or direct translations from English?

### Professionalism
- Is the tone appropriate for a professional application?
- Is it using polite form (です・ます) where appropriate?

### Consistency
- Are similar concepts expressed using consistent terminology?
- Example: Always use "ファイル" for "file", not mixing with "文書"

### Grammar
- Are particles (は, が, を, に, etc.) used correctly?
- Are verb conjugations appropriate?

**Note**: These are recommendations to improve quality, not blocking issues.

### Common UI Term Standards
- File → ファイル
- Save → 保存
- Open → 開く
- Close → 閉じる
- Word Count → 文字数
- Reading Time → 読了時間

## 📚 Reference Documents

When reviewing, you can reference:
- **`.cursorrules`** - Main rules (MUST READ FIRST)
- **`.cursor/rules/storage-service.md`** - Storage service details
- **`.cursor/rules/language-policy.md`** - Language policy explanations
- **`.cursor/rules/ui-guidelines.md`** - UI translation standards
- **`docs/STORAGE_*.md`** - Storage service documentation

## 🆘 When to Block a PR

**Immediate Block (🚫) - Do not approve until fixed:**
1. Commits violate atomic commit principle
2. Chinese or Korean text in code/comments/commits/issues/PRs
3. Security vulnerabilities
4. Missing Japanese in user-facing UI

**Request Changes (⚠️):**
1. Performance issues with user impact
2. Type safety problems
3. Not using StorageService where required
4. Missing or incorrect React hook dependencies

**Approve with Suggestions (✅):**
1. Minor code style issues
2. Japanese phrasing suggestions
3. Optional performance optimizations
4. Documentation improvements

---

**Note**: This document should evolve with the project. Update standards as new patterns emerge or requirements change.

**Version**: 2.1.1  
**Last Updated**: 2026-02-06  
**Changes in 2.1.1**: 
- Clarified language policy applies to Issues and PRs
- Added GitHub communication checks
**Changes in 2.1.0**: Added branch management requirements
