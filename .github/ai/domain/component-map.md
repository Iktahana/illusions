# Domain Policy: Component Responsibility Map

| Component / Hook                                             | Responsible For                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `src/app/page.tsx`                                           | Top-level coordinator                                               |
| `src/components/EditorLayout.tsx`                            | Layout structure only                                               |
| `src/components/Editor.tsx`                                  | Milkdown + ProseMirror bridge                                       |
| `src/lib/editor-page/use-linting.ts`                         | RuleRunner lifecycle and lint state                                 |
| `src/lib/editor-page/use-file-opening.ts`                    | Open/save dialogs and IPC                                           |
| `src/lib/editor-page/window-activity.ts`                     | Framework-free focus/visibility signal source                       |
| `src/lib/editor-page/power-policy.ts`                        | Power decisions: watcher pause / auto-save interval / POS highlight |
| `src/lib/tab-manager/save-executor.ts`                       | Single save pipeline for all save flows + per-path save lock        |
| `src/lib/auth/` (token-storage / \*-session / session-epoch) | Auth adapters + session control                                     |
| `src/lib/services/history-service.ts`                        | Snapshot history facade over policy / persistence layers            |
| `src/lib/services/persisted-json-list.ts`                    | Shared persisted list base (dictionary, ignored corrections)        |
| `src/lib/menu/menu-template.js`                              | Single source for Web + Electron menu and accelerators              |
| `packages/milkdown-plugin-japanese-novel/mdi-document.ts`    | MDI single-entry API                                                |
| `src/lib/storage/storage-service.ts`                         | Storage singleton                                                   |
| `src/lib/vfs/`                                               | Filesystem abstraction                                              |
| `electron/preload.js`                                        | IPC security boundary                                               |
| `electron/lib/`                                              | Main-process shared primitives                                      |

References: `docs/architecture/storage-system.md`, `src/types/electron.d.ts`. MDI format spec: https://github.com/illusions-lab/MDI

## Native menu availability

- When adding or changing a menu item, define its availability for every application state, including the welcome screen, an active editor tab, and the Settings window.
- A command that requires an open editor tab (for example save, print, export, or close tab) must be disabled when no editor tab is active; do not leave an action enabled if it cannot succeed in the current screen.
- Keep the renderer-reported menu UI state, `electron/menu.js`, and the shared menu template in sync, and add or update a native-menu test for new state-dependent behavior.
