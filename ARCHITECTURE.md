# Architecture Overview

This repository uses a two-process Electron architecture. The renderer process hosts the React and Next.js UI, while the main process owns privileged OS integration such as filesystem access, native menus, dialogs, and window lifecycle management.

## Layer Flow

```text
User Input
  → components/          (React UI components)
  → lib/editor-page/     (Editor-specific custom hooks)
  → lib/linting/         (Japanese writing and proofreading rules)
  → lib/storage/         (IndexedDB/SQLite abstraction)
  → lib/vfs/             (Filesystem abstraction)
  → types/electron.d.ts  (IPC type definitions)
  → electron/preload.js  (IPC security boundary)
  → electron/            (Main process - Node.js runtime)
  → OS/Filesystem
```

## Directory Responsibilities

`app/`
Next.js app-router entrypoints, route-level composition, and global page scaffolding for the renderer UI.

`components/`
Reusable React view components that render editor, dialogs, panels, and layout primitives without owning low-level platform access.

`lib/`
Shared application logic, editor hooks, linting rules, storage adapters, and virtual filesystem abstractions used across the renderer.

`electron/`
Electron main-process code, preload bridge, IPC handlers, native integrations, and platform-specific services that require Node.js privileges.

`packages/`
Standalone internal packages such as Milkdown extensions and supporting editor-specific modules that can evolve independently from app wiring.

`www/`
Static marketing or web-facing assets that are published separately from the desktop runtime.
