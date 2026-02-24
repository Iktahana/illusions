# Project Lifecycle Documentation

Project vs Standalone mode management with `.illusions/` directory structure, metadata persistence, and workspace state.

---

## Overview

The project lifecycle system manages two distinct editor modes: **Project Mode** (a directory with metadata, workspace state, and history) and **Standalone Mode** (a single file with no project context). Project Mode creates a `.illusions/` directory alongside the main file to store configuration, editor state, and version history.

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `lib/project-types.ts` | ~201 | Type definitions for project and standalone modes |
| `lib/project-service.ts` | ~564 | Project creation, opening, saving, validation |
| `lib/project-manager.ts` | ~326 | Web-only: FileSystemDirectoryHandle persistence in IndexedDB |

### Features

- Two modes: Project (full metadata) and Standalone (single file)
- Project directory with `project.json`, `workspace.json`, and `history/`
- Cross-platform name validation (Windows reserved name checks)
- Web: persistent directory handles via IndexedDB
- File extension support: `.mdi`, `.md`, `.txt`

---

## Architecture

### System Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Editor Application                                       │
│                                                           │
│  EditorMode = ProjectMode | StandaloneMode | null        │
│                                                           │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │ "New Project"       │  │ "Open File"               │ │
│  │ createProject()     │  │ openStandaloneFile()      │ │
│  │    → ProjectMode    │  │    → StandaloneMode       │ │
│  └─────────┬───────────┘  └───────────┬───────────────┘ │
│            │                          │                  │
│            ▼                          ▼                  │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │ ProjectService      │  │ Single file, no .illusions│ │
│  │                     │  │ directory                 │ │
│  │ - createProject     │  └───────────────────────────┘ │
│  │ - openProject       │                                │
│  │ - saveProject       │                                │
│  │ - validateProject   │                                │
│  │   Structure         │                                │
│  └─────────┬───────────┘                                │
│            │                                             │
│            ▼                                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ProjectManager (Web only)                         │   │
│  │                                                    │   │
│  │ Persists FileSystemDirectoryHandle in IndexedDB   │   │
│  │ restoreProjectHandle() → validates + permissions  │   │
│  │ Lists projects by recency                         │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘

                        │
                        ▼  (Project Mode only)

┌──────────────────────────────────────────────────────────┐
│  project-root/                                            │
│  ├── main.mdi                 (main document file)       │
│  └── .illusions/                                         │
│      ├── project.json         (project configuration)    │
│      ├── workspace.json       (editor workspace state)   │
│      └── history/                                        │
│          ├── index.json       (snapshot metadata)        │
│          ├── *.history        (snapshot files)           │
│          └── .history_bookmarks.json                     │
└──────────────────────────────────────────────────────────┘
```

### Project Creation Flow

```
User clicks "New Project"
         │
         ▼
  validateProjectName(name)
  - Non-empty
  - Max 200 characters
  - No special chars: < > : " / \ | ? *
  - Not Windows reserved: CON, PRN, AUX, NUL, COM1-9, LPT1-9
         │
         ▼
  Open directory picker (dialog or File System Access API)
         │
         ▼
  Create directory structure:
  - .illusions/
  - .illusions/history/
         │
         ▼
  Generate UUID for projectId
         │
         ▼
  Write project.json (ProjectConfig)
  Write workspace.json (WorkspaceState)
  Write history/index.json (empty HistoryIndex)
         │
         ▼
  Create main file (e.g., main.mdi)
         │
         ▼
  Save file handles (Web: IndexedDB, Electron: paths)
         │
         ▼
  Return ProjectMode
```

### Mode Comparison

| Feature | Project Mode | Standalone Mode |
|---------|-------------|-----------------|
| `.illusions/` directory | Yes | No |
| Version history | Yes | No |
| Workspace state persistence | Yes | No |
| Project metadata | Yes | No |
| File extension | `.mdi`, `.md`, `.txt` | `.mdi`, `.md`, `.txt` |
| Multiple files (future) | Planned | No |

---

## Key Interfaces and Types

```typescript
/** Supported file extensions */
type SupportedFileExtension = ".mdi" | ".md" | ".txt";

/** The top-level editor mode union */
type EditorMode = ProjectMode | StandaloneMode | null;

/** Project mode: full project context */
interface ProjectMode {
  type: "project";
  projectId: string;              // UUID v4
  name: string;                   // Project display name
  rootHandle: FileSystemDirectoryHandle; // Project root directory
  mainFileHandle: FileSystemFileHandle;  // Main document file
  metadata: ProjectConfig;
  workspaceState: WorkspaceState;
  rootPath?: string;              // Absolute path (Electron only)
}

/** Standalone mode: single file without project context */
interface StandaloneMode {
  type: "standalone";
  fileHandle: FileSystemFileHandle;
  fileName: string;
  fileExtension: SupportedFileExtension;
  editorSettings: EditorSettings;
}

/** Project configuration stored in project.json */
interface ProjectConfig {
  version: "1.0.0";
  projectId: string;              // UUID v4
  name: string;
  mainFile: string;               // e.g., "main.mdi"
  mainFileExtension: SupportedFileExtension;
  createdAt: string;              // ISO 8601
  lastModified: string;           // ISO 8601
  author?: string;
  description?: string;
  tags?: string[];
  editorSettings: EditorSettings;
}

/** Workspace state stored in workspace.json */
interface WorkspaceState {
  editorState: {
    cursorPosition: number;
    scrollTop: number;
    selection: SelectionRange | null;
  };
  lastOpenedAt: string;           // ISO 8601
  viewState: {
    activeView: string;
    inspectorTab: string;
    panelStates: Record<string, boolean>;
  };
}
```

### Type Guards

```typescript
/** Check if current mode is ProjectMode */
function isProjectMode(mode: EditorMode): mode is ProjectMode;

/** Check if current mode is StandaloneMode */
function isStandaloneMode(mode: EditorMode): mode is StandaloneMode;
```

### Default Helpers

```typescript
/** Returns default editor settings for new projects/files */
function getDefaultEditorSettings(): EditorSettings;

/** Returns default workspace state for new projects */
function getDefaultWorkspaceState(): WorkspaceState;
```

---

## Code Examples

### Creating a New Project

```typescript
import { ProjectService } from "@/lib/project-service";

const projectService = new ProjectService();

// Validate the project name first
const nameError = projectService.validateProjectName("My Novel");
if (nameError) {
  showError(nameError);
  return;
}

// Create the project (opens directory picker)
const projectMode = await projectService.createProject({
  name: "My Novel",
  mainFileExtension: ".mdi",
  author: "Author Name",
});

// projectMode.type === "project"
// projectMode.projectId === "550e8400-e29b-41d4-a716-446655440000"
// Files created: .illusions/project.json, .illusions/workspace.json, etc.
```

### Opening an Existing Project

```typescript
const projectMode = await projectService.openProject(directoryHandle);

// Validates project structure:
// - .illusions/ directory exists
// - project.json is valid
// - Main file exists
// - Version compatibility check

if (projectMode) {
  setEditorMode(projectMode);
}
```

### Opening a Standalone File

```typescript
const standaloneMode = await projectService.openStandaloneFile(fileHandle);

// standaloneMode.type === "standalone"
// standaloneMode.fileName === "draft.mdi"
// standaloneMode.fileExtension === ".mdi"
// No .illusions/ directory involved
```

### Saving Project State

```typescript
await projectService.saveProject(projectMode, {
  content: editorContent,
  workspaceState: {
    editorState: {
      cursorPosition: editor.getCursorPosition(),
      scrollTop: editor.getScrollTop(),
      selection: editor.getSelection(),
    },
    lastOpenedAt: new Date().toISOString(),
    viewState: currentViewState,
  },
});
```

### Restoring a Project Handle (Web)

```typescript
import { ProjectManager } from "@/lib/project-manager";

const projectManager = new ProjectManager();

// List recent projects (sorted by recency)
const recentProjects = await projectManager.listProjects();

// Restore a project handle from IndexedDB
const handle = await projectManager.restoreProjectHandle(projectId);

if (handle) {
  // Validates handle is still accessible and requests permission
  const projectMode = await projectService.openProject(handle);
  setEditorMode(projectMode);
} else {
  // Handle no longer valid (directory moved/deleted)
  showError("Project directory not found. Please reopen manually.");
}
```

### Using Type Guards

```typescript
function renderStatusBar(mode: EditorMode) {
  if (isProjectMode(mode)) {
    return `Project: ${mode.name} — ${mode.metadata.mainFile}`;
  }

  if (isStandaloneMode(mode)) {
    return `File: ${mode.fileName}`;
  }

  return "No file open";
}
```

### Project Name Validation

```typescript
// Valid names
projectService.validateProjectName("My Novel");         // null (valid)
projectService.validateProjectName("Novel 2026");        // null (valid)

// Invalid names
projectService.validateProjectName("");                  // "Name cannot be empty"
projectService.validateProjectName("a".repeat(201));     // "Name too long (max 200)"
projectService.validateProjectName("my<novel>");         // "Invalid characters"
projectService.validateProjectName("CON");               // "Reserved name"
projectService.validateProjectName("LPT1");              // "Reserved name"
```

---

## Directory Structure Detail

### `.illusions/project.json`

```json
{
  "version": "1.0.0",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My Novel",
  "mainFile": "main.mdi",
  "mainFileExtension": ".mdi",
  "createdAt": "2026-02-25T10:00:00.000Z",
  "lastModified": "2026-02-25T14:30:00.000Z",
  "author": "Author Name",
  "description": "A novel project",
  "tags": ["fiction", "draft"],
  "editorSettings": { }
}
```

### `.illusions/workspace.json`

```json
{
  "editorState": {
    "cursorPosition": 1024,
    "scrollTop": 500,
    "selection": null
  },
  "lastOpenedAt": "2026-02-25T14:30:00.000Z",
  "viewState": {
    "activeView": "editor",
    "inspectorTab": "outline",
    "panelStates": {
      "inspector": true,
      "statusBar": true
    }
  }
}
```

### `.illusions/history/index.json`

```json
{
  "snapshots": [],
  "maxSnapshots": 100,
  "retentionDays": 90
}
```

---

## ProjectManager (Web Only)

The `ProjectManager` class handles persistence of `FileSystemDirectoryHandle` objects in IndexedDB, which is necessary because the File System Access API handles cannot survive page reloads without explicit storage.

| Method | Description |
|--------|-------------|
| `restoreProjectHandle(id)` | Retrieve and validate a stored handle, check permissions |
| `listProjects()` | List all stored projects sorted by most recently opened |
| `removeProject(id)` | Remove a stored handle from IndexedDB |

The `restoreProjectHandle` method:
1. Retrieves the `FileSystemDirectoryHandle` from IndexedDB
2. Calls `handle.queryPermission()` to check current permissions
3. If not granted, calls `handle.requestPermission()` to prompt the user
4. Returns `null` if the handle is invalid or permission is denied

---

## Related Documentation

- [History Service](./history-service.md) -- Version history stored within `.illusions/history/`
- [Storage System](./storage-system.md) -- Application-level persistence (separate from project state)
- [File Watcher](./file-watcher.md) -- External change detection for open files

---

**Last Updated**: 2026-02-25
**Version**: 1.0.0
