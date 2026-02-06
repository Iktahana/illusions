# AI Rules Guide for Illusions Project

## 📋 Overview

This document explains the AI rules structure for the Illusions project, updated on 2026-02-06.

## 🎯 Rule Files Structure

### 1. `.cursorrules` - Single Source of Truth ⭐
**Location**: `/Users/iktahana/Cursor/illusions/.cursorrules`

**Purpose**: The ONE file that all AI assistants (Cursor, Claude, GitHub Copilot, etc.) MUST read and follow.

**Contains**:
- 🔴 **Critical Rules** (Non-negotiable):
  - Branch & Directory Management (MANDATORY - use feature branches, clean up after merge)
  - Atomic Commit Strategy (MANDATORY - as important as language policy)
  - Language Standards (English/Japanese only, NO Chinese/Korean)
- 🟡 **High Priority Rules**:
  - TypeScript & Code Style Standards
  - React Best Practices
  - Security Standards
- 🟢 **Project-Specific Rules**:
  - Storage Service (Mandatory usage)
  - Electron-Specific Rules
  - Next.js-Specific Rules
  - Milkdown Plugin Development
  - Performance Standards
- 🔵 **Workflow & Collaboration**:
  - Token Usage Optimization
  - Testing Standards
  - Review Checklist

**File Size**: ~800 lines (comprehensive but focused)

**When to Read**: Every AI agent should read this file before starting any task.

### 2. `CLAUDE.md` - Code Review Guidelines
**Location**: `/Users/iktahana/Cursor/illusions/CLAUDE.md`

**Purpose**: Specific instructions for performing code reviews (primarily for Claude Code).

**Contains**:
- Review output format
- Priority levels for issues
- Step-by-step review process
- When to block/approve PRs
- Japanese quality guidelines (advisory)

**When to Read**: When performing PR reviews or code quality checks.

### 3. Documentation Files (Reference Only)
**Location**: `/Users/iktahana/Cursor/illusions/docs/`

**Examples**:
- `STORAGE_*.md` - Storage service documentation
- `ELECTRON_*.md` - Electron integration guides
- Technical specifications

**Purpose**: Detailed technical documentation and guides.

**When to Read**: When implementing specific features or needing technical details.

## 🚨 Critical Rules Summary

### Rule 1: Branch & Directory Management (MANDATORY)
**Priority**: 🔴 CRITICAL

**Requirements**:
- ❌ **NEVER** work directly on main branch for new features
- ✅ **ALWAYS** create feature branch: `git checkout -b feature/my-feature`
- ✅ **ALWAYS** check for old branches/directories before starting
- ✅ **ALWAYS** clean up after merge (delete branch and working directory)

**Example - BAD**:
```bash
# On main branch
git add src/new-feature.ts
git commit -m "feat: add new feature"  # DON'T DO THIS!
```

**Example - GOOD**:
```bash
# Check for old work first
git branch | grep feature/
ls -la | grep work-

# Create feature branch
git checkout -b feature/auto-save
# ... do work ...
git commit -m "feat: add auto-save"

# Merge and cleanup
git checkout main
git merge feature/auto-save
git branch -d feature/auto-save
```

### Rule 2: Atomic Commits (MANDATORY)
**Priority**: 🔴 CRITICAL - Equal to language policy

**Requirements**:
- ❌ **NEVER** use `git add .`
- ✅ Stage files individually: `git add src/file1.ts src/file2.ts`
- ✅ One commit = One logical change
- ✅ Use Conventional Commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:`

**Example - BAD**:
```bash
git add .
git commit -m "fixed stuff"
```

**Example - GOOD**:
```bash
git add src/utils/word-count.ts
git commit -m "fix: resolve zero-division error in word count"

git add src/components/stats.css
git commit -m "style: adjust paragraph spacing in stats dashboard"
```

### Rule 3: Language Standards (MANDATORY)
**Priority**: 🔴 CRITICAL

**Requirements**:
- ❌ **ABSOLUTELY FORBIDDEN**: Chinese (中文), Korean (한국어)
- ✅ **ALLOWED**: English (code/comments), Japanese (UI/comments)
- ✅ **UI MUST BE**: Japanese only

**Applies To**:
- Code (variables, functions, classes)
- Comments (inline, block, JSDoc)
- Documentation (README, specs)
- Commit messages
- UI strings (buttons, menus, dialogs)

### Rule 4: Storage Service (MANDATORY)
**Priority**: 🔴 CRITICAL

**Requirements**:
- ✅ **ALWAYS** use `getStorageService()` from `@/lib/storage-service`
- ❌ **NEVER** implement custom storage logic
- ❌ **NEVER** use localStorage/IndexedDB/SQLite directly

**Example**:
```typescript
import { getStorageService } from "@/lib/storage-service";

const storage = getStorageService();
await storage.saveSession({ ... });
```

## 📊 Changes from Previous Structure

### Before (Scattered Rules)
```
.cursorrules (80 lines, partial rules)
CLAUDE.md (191 lines, code review only)
.cursor/rules/
  ├── language-policy.md
  ├── storage-service.md
  ├── ui-guidelines.md
  ├── mdi-syntax.md
  └── STORAGE_QUICK_REMINDER.txt
```

**Problems**:
- ❌ Rules scattered across multiple files
- ❌ AI agents might not read all files
- ❌ Duplicate rules (atomic commit repeated)
- ❌ Inconsistent priorities
- ❌ Hard to maintain

### After (Unified Rules)
```
.cursorrules (800 lines, ALL rules)
CLAUDE.md (updated with references)
docs/ (technical documentation only)
```

**Benefits**:
- ✅ Single source of truth
- ✅ All AI agents read the same rules
- ✅ No duplicates
- ✅ Clear priority levels
- ✅ Easy to maintain
- ✅ Comprehensive coverage

## 🔍 How AI Agents Should Use These Rules

### For Cursor AI / GitHub Copilot
1. Read `.cursorrules` on project start
2. Follow all rules strictly
3. Reference specific sections as needed

### For Claude Code Review
1. Read `.cursorrules` first (all rules)
2. Read `CLAUDE.md` for review format
3. Apply rules when reviewing PRs

### For Any AI Assistant
1. **Always start by reading** `.cursorrules`
2. Follow critical rules (atomic commits, language policy) without exception
3. Reference documentation in `docs/` for technical details

## 📝 Rule Priority Levels

### 🔴 Critical (BLOCKING)
- Working directly on main branch for new features
- Not checking for old branches/directories before starting
- Atomic commit violations
- Language policy violations (Chinese/Korean in code)
- Security vulnerabilities
- Missing Japanese in UI

**Action**: Block PR until fixed

### 🟡 High Priority
- Performance issues
- Type safety problems
- Not using StorageService
- Missing React hook dependencies

**Action**: Request changes before merge

### 🟢 Medium Priority
- Code style inconsistencies
- Missing optimizations

**Action**: Address in follow-up

### 🔵 Low Priority (Advisory)
- Japanese phrasing improvements
- Minor refactoring suggestions

**Action**: Optional improvements

## 🆘 Quick Reference

### Most Common Mistakes to Avoid
1. ❌ Working directly on main branch
2. ❌ Not checking for old branches/directories
3. ❌ Not cleaning up after merge
4. ❌ Using `git add .`
5. ❌ Grouping unrelated changes
6. ❌ Using Chinese/Korean in code
7. ❌ Not translating UI to Japanese
8. ❌ Implementing custom storage logic
9. ❌ Using `any` type excessively
10. ❌ Forgetting useEffect cleanup
11. ❌ Missing hook dependencies

### Quick Commands
```bash
# Before starting work
git branch | grep feature/
ls -la | grep work-

# Create feature branch
git checkout -b feature/my-feature

# Good commit workflow
git add src/specific-file.ts
git commit -m "feat: add new feature"

# Merge and cleanup
git checkout main
git merge feature/my-feature
git branch -d feature/my-feature

# Check language compliance
grep -r "[\u4e00-\u9fff]" src/  # Chinese check
grep -r "[\uac00-\ud7af]" src/  # Korean check

# Use storage service
import { getStorageService } from "@/lib/storage-service";
```

## 📚 Further Reading

- **Full Rules**: `.cursorrules`
- **Code Review**: `CLAUDE.md`
- **Storage Service**: `docs/STORAGE_INDEX.md`
- **Electron Integration**: `docs/ELECTRON_INTEGRATION_CHECKLIST.md`

---

**Version**: 2.1.0  
**Last Updated**: 2026-02-06  
**Status**: ✅ Active - All AI agents must follow
**Changes in 2.1.0**:
- Added Branch & Directory Management as CRITICAL rule
- Added pre-work branch/directory checks
- Added cleanup requirements after merge
