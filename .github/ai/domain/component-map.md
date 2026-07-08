# Domain Policy: Component Responsibility Map

| Component / Hook                                          | Responsible For                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `app/page.tsx`                                            | Top-level coordinator                                               |
| `components/EditorLayout.tsx`                             | Layout structure only                                               |
| `components/Editor.tsx`                                   | Milkdown + ProseMirror bridge                                       |
| `lib/editor-page/use-linting.ts`                          | RuleRunner lifecycle and lint state                                 |
| `lib/editor-page/use-file-opening.ts`                     | Open/save dialogs and IPC                                           |
| `lib/editor-page/window-activity.ts`                      | Framework-free focus/visibility signal source                       |
| `lib/editor-page/power-policy.ts`                         | Power decisions: watcher pause / auto-save interval / POS highlight |
| `lib/tab-manager/save-executor.ts`                        | Single save pipeline for all save flows + per-path save lock        |
| `lib/auth/` (token-storage / \*-session / session-epoch)  | Auth adapters + session control                                     |
| `lib/services/history-service.ts`                         | Snapshot history facade over policy / persistence layers            |
| `lib/services/persisted-json-list.ts`                     | Shared persisted list base (dictionary, ignored corrections)        |
| `lib/menu/menu-template.js`                               | Single source for Web + Electron menu and accelerators              |
| `packages/milkdown-plugin-japanese-novel/mdi-document.ts` | MDI single-entry API                                                |
| `lib/storage/storage-service.ts`                          | Storage singleton                                                   |
| `lib/vfs/`                                                | Filesystem abstraction                                              |
| `electron/preload.js`                                     | IPC security boundary                                               |
| `electron/lib/`                                           | Main-process shared primitives                                      |

References: `docs/architecture/storage-system.md`, `types/electron.d.ts`. MDI format spec: https://github.com/illusions-lab/MDI
