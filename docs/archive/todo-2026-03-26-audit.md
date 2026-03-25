# Todo Audit 2026-03-26

Status: all 5 requested items verified against current code.

## Checklist

- [x] File tree overwrite / duplicate flow lacks collision protection
- [x] Dirty tab close ordering is inverted
- [x] `FileConflictDialog` is dead code and diverges from the live conflict flow
- [x] Electron native menu accelerators drift from customizable keymap settings
- [x] Recent project timestamps are fabricated in the renderer

## Findings

### 1. File tree overwrite / duplicate flow lacks collision protection

Status: confirmed

Evidence:
- `duplicate` writes the copied content directly to the target path with no existence check in [components/explorer/FilesPanel.tsx](/Users/iktahana/Repositories/illusions/components/explorer/FilesPanel.tsx#L218).
- New file creation writes an empty file directly to the requested path with no guard in [components/explorer/FilesPanel.tsx](/Users/iktahana/Repositories/illusions/components/explorer/FilesPanel.tsx#L260).
- External OS file drop writes every dropped file directly into the destination directory in [components/explorer/FilesPanel.tsx](/Users/iktahana/Repositories/illusions/components/explorer/FilesPanel.tsx#L356).
- Web VFS `writeFile()` resolves or creates the file handle and writes immediately in [lib/vfs/web-vfs.ts](/Users/iktahana/Repositories/illusions/lib/vfs/web-vfs.ts#L284).
- Electron VFS `writeFile()` creates parent directories and then writes immediately in [lib/vfs/electron-vfs.ts](/Users/iktahana/Repositories/illusions/lib/vfs/electron-vfs.ts#L271).

Impact:
- Duplicate can overwrite an existing `foo (コピー).mdi`.
- New file can silently replace an existing file if the name collides.
- External drag-and-drop can overwrite project files without rename-on-conflict or confirmation.

### 2. Dirty tab close ordering is inverted

Status: confirmed

Evidence:
- Dockview tab header close button and middle-click both call `api.close()` immediately in [lib/dockview/dockview-components.tsx](/Users/iktahana/Repositories/illusions/lib/dockview/dockview-components.tsx#L108).
- Dockview removal is bridged back into tab state via `onDidRemovePanel`, which calls `closeTab(e.id)` only after the panel is removed in [lib/dockview/use-dockview-adapter.ts](/Users/iktahana/Repositories/illusions/lib/dockview/use-dockview-adapter.ts#L166).
- The actual dirty guard lives in `closeTab()`, which only then sets `pendingCloseTabId` for dirty editor tabs in [lib/tab-manager/use-tab-state.ts](/Users/iktahana/Repositories/illusions/lib/tab-manager/use-tab-state.ts#L271).

Impact:
- The visible tab disappears before the unsaved-changes confirmation state is entered.
- Any restore path depends on later state reconciliation instead of preventing the close upfront.

### 3. `FileConflictDialog` is dead code and diverges from the live conflict flow

Status: confirmed

Evidence:
- `FileConflictDialog` is a complete blocking dialog component with local/remote resolution actions in [components/FileConflictDialog.tsx](/Users/iktahana/Repositories/illusions/components/FileConflictDialog.tsx#L72).
- The symbol is not rendered anywhere else in the repo; only its own file and overlay docs reference it.
- The live dirty-file external-change flow uses a persistent notification with actions for diff, disk, and keep-editor in [lib/tab-manager/use-file-watch-integration.ts](/Users/iktahana/Repositories/illusions/lib/tab-manager/use-file-watch-integration.ts#L89).

Impact:
- Two different conflict-resolution UX designs exist, but only one is wired.
- The dead dialog offers a different action surface from the live notification flow.

### 4. Electron native menu accelerators drift from customizable keymap settings

Status: confirmed

Evidence:
- Electron menu has a partial `DEFAULT_ACCELERATORS` map and `resolveAccelerator()` override path in [electron/menu.js](/Users/iktahana/Repositories/illusions/electron/menu.js#L23).
- Only some items use `resolveAccelerator()`, such as new/open/save/close-tab/paste-as-plaintext/compact-mode in [electron/menu.js](/Users/iktahana/Repositories/illusions/electron/menu.js#L107).
- Core edit actions still use native `role` menu items with no override injection for undo, redo, and select-all in [electron/menu.js](/Users/iktahana/Repositories/illusions/electron/menu.js#L194).
- Zoom actions also remain plain `role` items with no keymap override path in [electron/menu.js](/Users/iktahana/Repositories/illusions/electron/menu.js#L265).
- Web menu definitions still expose accelerators for these actions in [lib/menu/menu-definitions.ts](/Users/iktahana/Repositories/illusions/lib/menu/menu-definitions.ts#L57).

Impact:
- User-customized shortcuts can diverge from what the Electron native menu displays.
- Some commands are effectively configurable in one menu surface but fixed in another.

### 5. Recent project timestamps are fabricated in the renderer

Status: confirmed

Evidence:
- Electron `useRecentProjects()` maps every loaded project to `lastAccessedAt: Date.now()` instead of preserving stored recency in [lib/editor-page/use-recent-projects.ts](/Users/iktahana/Repositories/illusions/lib/editor-page/use-recent-projects.ts#L37).
- The delete-refresh path repeats the same remapping in [lib/editor-page/use-recent-projects.ts](/Users/iktahana/Repositories/illusions/lib/editor-page/use-recent-projects.ts#L88).
- The welcome screen renders relative time directly from `project.lastAccessedAt` in [components/WelcomeScreen.tsx](/Users/iktahana/Repositories/illusions/components/WelcomeScreen.tsx#L33) and [components/WelcomeScreen.tsx](/Users/iktahana/Repositories/illusions/components/WelcomeScreen.tsx#L232).
- Electron recent-project storage does track recency in SQLite `updated_at`, but `getRecentProjects()` returns only `{ id, rootPath, name }`, so the renderer discards true recency and substitutes the current time in [lib/storage/electron-storage-manager.ts](/Users/iktahana/Repositories/illusions/lib/storage/electron-storage-manager.ts#L338) and [lib/storage/electron-storage-manager.ts](/Users/iktahana/Repositories/illusions/lib/storage/electron-storage-manager.ts#L377).

Impact:
- Welcome screen relative times in Electron are inherently inaccurate.
- Deleting one recent project refreshes the remaining list as if everything was just opened.

## Notes

- Existing unrelated local modification detected in [components/SidebarPanel.tsx](/Users/iktahana/Repositories/illusions/components/SidebarPanel.tsx); this audit file intentionally avoids touching it.
