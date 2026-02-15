# Illusions Project - GitHub Copilot Instructions

## Project Overview

**Illusions** is a Japanese novel writing application with advanced typesetting support.

- **Purpose**: Professional Japanese novel editor with vertical writing, ruby notation, and AI-powered proofreading
- **Target Users**: Japanese novelists, writers, and content creators
- **Key Features**:
  - Vertical writing mode (縦書き) with proper scroll handling
  - Ruby notation (振り仮名): `{漢字|かんじ}` syntax
  - Tate-chu-yoko (縦中横): Horizontal digits in vertical text
  - Part-of-speech highlighting using Kuromoji morphological analyzer
  - AI-assisted proofreading via browser native AI
  - Local-first data storage (no cloud)

## Technology Stack

### Frontend
- **Framework**: Next.js 16 (App Router), React 18
- **Language**: TypeScript (strict mode enabled)
- **Editor**: Milkdown 7 (ProseMirror-based) with custom Japanese plugin
- **Styling**: Tailwind CSS 3, CSS custom properties for theming
- **State**: React Context API, custom hooks

### Desktop
- **Runtime**: Electron 32
- **Storage**: SQLite (better-sqlite3) via StorageService abstraction
- **IPC**: Typed channels with contextIsolation enabled

### Web
- **Storage**: IndexedDB via Dexie (same StorageService API)
- **PWA**: Serwist service worker for offline support

### NLP & Analysis
- **Tokenizer**: Kuromoji (Japanese morphological analyzer)
- **Backend**: Node.js workers for heavy processing
- **Cache**: In-memory LRU cache for tokenization results

## Coding Standards

### Language Policy (CRITICAL)

**STRICTLY FORBIDDEN in code/documentation:**
- ❌ Chinese (中文/中国語)
- ❌ Korean (한국어/韓国語)
- ❌ Any other languages except English and Japanese

**ALLOWED:**
- ✅ English: Code logic (variables, functions, types, comments)
- ✅ Japanese (日本語): UI strings, user-facing text, internal comments

**User-facing text MUST be in Japanese:**
- Menu items, dialog boxes, buttons, labels, tooltips
- Error messages, notifications, status text
- Documentation for end users

### Naming Conventions

- **Components/Classes**: PascalCase (`EditorComponent`, `StorageManager`)
- **Functions/Variables**: camelCase (`handleClick`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`, `DEFAULT_FONT_SIZE`)
- **Types/Interfaces**: PascalCase with descriptive names (`EditorProps`, `FileMetadata`)
- **Files**:
  - Components: PascalCase (`Editor.tsx`)
  - Utilities: kebab-case (`use-mdi-file.ts`)

### TypeScript Requirements

- **Strict mode**: All files must work with `strict: true`
- **Avoid `any`**: Use `unknown` or specific types
- **Type imports**: Use `import type` for type-only imports
- **Return types**: Public functions must have explicit return types
- **No implicit any**: All parameters and variables must be typed

### React Best Practices

- **Functional components**: Prefer function components over class components
- **Hooks dependencies**: Always verify `useEffect`, `useCallback`, `useMemo` dependency arrays
- **Event handlers**: Name with `handle` prefix (`handleClick`, `handleChange`)
- **Memory leaks**: Clean up event listeners, subscriptions in `useEffect` return functions
- **Performance**: Use `React.memo`, `useCallback`, `useMemo` where appropriate

### Storage Service (MANDATORY)

**DO NOT implement custom storage logic. ALWAYS use StorageService.**

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

**12 Core Methods:**
- Session: `saveSession()`, `loadSession()`
- App State: `saveAppState()`, `loadAppState()`
- Recent Files: `addToRecent()`, `getRecentFiles()`, `removeFromRecent()`, `clearRecent()`
- Editor Buffer: `saveEditorBuffer()`, `loadEditorBuffer()`, `clearEditorBuffer()`
- Utility: `clearAll()`

**Storage Locations:**
- Electron: SQLite at `~/Library/Application Support/illusions/illusions-storage.db`
- Web: Browser IndexedDB via Dexie

**What NOT to do:**
- ❌ Use localStorage directly
- ❌ Use IndexedDB directly
- ❌ Implement custom storage logic in components
- ❌ Manually interact with SQLite

### Security Standards

- **No hardcoded secrets**: Never commit API keys, passwords, tokens
- **Electron IPC security**:
  - Verify `contextIsolation: true` in preload config
  - Check `nodeIntegration: false` in BrowserWindow
  - Validate all IPC message handlers
- **XSS prevention**: No `dangerouslySetInnerHTML` without sanitization
- **Code injection**: No `eval()`, `Function()`, dynamic script execution

## Build & Development

### Common Commands

```bash
# Development
npm run dev                  # Next.js dev server (port 3010)
npm run electron:dev         # Electron dev mode with hot reload

# Type checking (MUST pass before commit)
npm run type-check          # TypeScript validation
npx tsc --noEmit           # Same as above

# Building
npm run build              # Next.js production build
npm run electron:build     # Electron production build

# Dependencies
npm run download:fonts     # Download local fonts (required for build)
npm install                # Install dependencies
```

### Pre-commit Checklist

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No Chinese/Korean in code or documentation
- [ ] All UI text is in Japanese
- [ ] Using StorageService (not custom storage)
- [ ] React hooks dependencies are correct
- [ ] No security vulnerabilities or hardcoded secrets

## File Structure

```
illusions/
├── app/                    # Next.js App Router pages
├── components/            # React components
│   ├── Editor.tsx        # Main Milkdown editor
│   ├── Inspector.tsx     # Right sidebar (stats, AI)
│   └── ...
├── lib/                   # Business logic
│   ├── storage-service.ts        # Storage abstraction (ALWAYS USE THIS)
│   ├── nlp-backend/              # Japanese text processing
│   └── nlp-client/               # Client-side NLP interface
├── packages/
│   └── milkdown-plugin-japanese-novel/  # Custom Milkdown plugin
│       ├── index.ts              # Plugin entry
│       ├── nodes/                # Custom ProseMirror nodes (ruby, tcy)
│       ├── pos-highlight/        # Part-of-speech highlighting
│       └── scroll-progress.ts    # Vertical/horizontal scroll abstraction
├── electron/              # Electron main process
├── public/               # Static assets
├── .github/
│   ├── copilot-instructions.md   # This file
│   ├── agents/                   # Custom Copilot agents
│   └── workflows/                # GitHub Actions
└── docs/                 # Documentation
```

## Project-Specific Context

### Vertical Writing Mode (縦書き)

- Writing mode: `writing-mode: vertical-rl`
- Scroll direction: Right-to-left (rightmost = beginning)
- Scroll handling: Use `scroll-progress.ts` abstraction
- **CRITICAL**: Never hardcode horizontal-only logic

### MDI File Format

- Custom format: `.mdi` (Markdown with ruby syntax)
- Ruby notation: `{漢字|かんじ}` → `<ruby><rb>漢字</rb><rt>かんじ</rt></ruby>`
- Syntax spec: See `MDI.md` in repo root

### Part-of-Speech Highlighting

- Uses Kuromoji for tokenization
- 12 POS categories with color coding
- Viewport-based rendering for performance
- Cache tokenization results

### Browser Native AI

- Feature detection: `window.ai?.canCreateTextSession()`
- Status indicator: `AiStatusIndicator.tsx`
- Future: Real-time proofreading via Prompt API

## Testing Philosophy

- TypeScript strict mode is our primary test
- Manual testing for UI/UX
- E2E tests for critical user flows (future)

## Documentation References

- Quick nav: `docs/STORAGE_INDEX.md`
- Storage API: `docs/STORAGE_QUICK_REFERENCE.md`
- Architecture: `docs/STORAGE_ARCHITECTURE.md`
- Code examples: `lib/storage-service-examples.ts`

## Custom Agents Available

Use `@agent-name` in GitHub Copilot Chat:

- **@reviewer**: Pragmatic PR reviewer (focus on critical issues only)
- **@maintainer**: Issue triage and bug fixing
- **@ci-debugger**: CI/CD failure analysis

## Questions?

For project-specific questions:
1. Check `CLAUDE.md` for code review standards
2. Check `docs/` folder for technical documentation
3. Ask `@maintainer` agent for guidance
