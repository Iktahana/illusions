# illusions Documentation

Documentation for the illusions Japanese novel editor.

---

## Architecture

System architecture and design documents.

| Document | Description | Key Files |
|----------|-------------|-----------|
| [Storage System](architecture/storage-system.md) | Unified storage service (SQLite / IndexedDB) | `lib/storage-service.ts`, `lib/electron-storage.ts` |
| [Virtual File System](architecture/vfs.md) | VFS abstraction with security sandbox | `lib/vfs/`, `electron-vfs-ipc-handlers.js` |
| [LLM Engine](architecture/llm-engine.md) | Dual LLM engine (local + online) | `llm-service/`, `lib/llm-client/` |
| [Tab Manager](architecture/tab-manager.md) | Multi-tab state management and persistence | `lib/tab-manager/` |
| [Export System](architecture/export-system.md) | MDI export pipeline (PDF/EPUB/DOCX/TXT) | `lib/export/` |
| [File Watcher](architecture/file-watcher.md) | External file change detection | `lib/file-watcher.ts` |
| [History Service](architecture/history-service.md) | Snapshot history with character-level diff | `lib/history-service.ts`, `lib/diff-service.ts` |
| [Project Lifecycle](architecture/project-lifecycle.md) | Project vs standalone mode management | `lib/project-service.ts`, `lib/project-manager.ts` |
| [NLP Backend](architecture/nlp-backend-architecture.md) | Japanese text processing (kuromoji) | `lib/nlp-backend/`, `lib/nlp-client/` |
| [Notification System](architecture/notification-system.md) | Toast notification API | `lib/notification-manager.ts` |
| [Correction AI System](architecture/correction-ai-system.ja.md) | AI-powered proofreading architecture | `lib/linting/`, `llm-service/` |

## Guides

Development guides and how-to documents.

| Guide | Description |
|-------|-------------|
| [Milkdown Plugin Development](guides/milkdown-plugin.md) | Custom ProseMirror nodes, linting decorations, plugin architecture |
| [Writing Linting Rules](guides/linting-rules.md) | L1/L2/document-level rule hierarchy, presets, adding new rules |
| [Keyboard Shortcuts](guides/keyboard-shortcuts.md) | Full shortcut table, menu structure, platform differences |
| [Theme Colors](guides/THEME_COLORS.md) | Theming system and CSS custom properties |

## References

Reference materials and component catalogs.

| Reference | Description |
|-----------|-------------|
| [UI Overlays](references/ui-overlays.md) | All overlay components (dialogs, toasts, menus, tooltips) |
| [Japanese Standards (PDFs)](references/) | JIS X 4051, JTF style guide, joyo kanji table, etc. |

## Setup

Configuration and setup guides.

| Guide | Description |
|-------|-------------|
| [Claude Code Review Setup](setup/CLAUDE_REVIEW_SETUP.md) | Automated PR review with Claude |

## Project Root

| File | Description |
|------|-------------|
| [README.md](../README.md) | Project overview, features, installation |
| [CLAUDE.md](../CLAUDE.md) | AI agent rules and code review standards |
| [MDI.md](../MDI.md) | MDI file format syntax specification |
| [TERMS.md](../TERMS.md) | Terms of service |

---

## Directory Structure

```
docs/
├── README.md                              # This index file
├── architecture/                          # System architecture
│   ├── correction-ai-system.ja.md         # AI proofreading system
│   ├── export-system.md                   # Export pipeline
│   ├── file-watcher.md                    # File change detection
│   ├── history-service.md                 # Snapshot history
│   ├── llm-engine.md                      # LLM engine (local + online)
│   ├── nlp-backend-architecture.md        # NLP processing
│   ├── notification-system.md             # Notification API
│   ├── project-lifecycle.md               # Project management
│   ├── storage-system.md                  # Storage service
│   ├── tab-manager.md                     # Tab management
│   └── vfs.md                             # Virtual file system
├── guides/                                # Development guides
│   ├── keyboard-shortcuts.md              # Shortcuts reference
│   ├── linting-rules.md                   # Linting rule development
│   ├── milkdown-plugin.md                 # Plugin development
│   └── THEME_COLORS.md                    # Theming system
├── references/                            # Reference materials
│   ├── ui-overlays.md                     # UI overlay components
│   └── *.pdf                              # Japanese language standards
├── setup/                                 # Setup guides
│   └── CLAUDE_REVIEW_SETUP.md             # Claude review config
└── archive/                               # Archived documents
    └── bug-verification-2026-02-15.md     # Historical bug report
```

---

**Last Updated**: 2026-02-25
