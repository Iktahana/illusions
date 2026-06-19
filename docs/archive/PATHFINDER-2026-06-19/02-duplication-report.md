# Duplication and legacy report

Date: 2026-06-19

Every deletion item below was checked against static imports, dynamic `import()`, `require()`, and direct name/path references. Deletion still requires the verification gate in the execution plan because path-based loading and packaging behavior can escape a simple import graph.

## Confirmed legacy candidates

| Candidate                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                 | Decision                                                                                           | Confidence / gap                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `nlp-service/nlp-ipc-handlers.js`                       | It is an older near-copy of active `electron/ipc/nlp-ipc.js`; `electron/main.js:27` registers only the latter. No reference to `nlp-service/` exists.                                                                                                                                                                                                                    | Delete in the first hygiene PR.                                                                    | High. Electron bundle and NLP tests must still pass. |
| `components/AiStatusIndicator.tsx`                      | No runtime reference; only stale mention in `.github/copilot-instructions.md:261`.                                                                                                                                                                                                                                                                                       | Delete and update Copilot instructions.                                                            | High.                                                |
| `components/Navbar.tsx`                                 | No import/dynamic reference. Current chrome is assembled through `components/EditorLayout.tsx` and Web/Electron menus.                                                                                                                                                                                                                                                   | Delete.                                                                                            | High.                                                |
| `components/NewTabMenu.tsx` and `components/TabBar.tsx` | No runtime imports. Dockview replaced the legacy tab UI (`lib/dockview/dockview-components.tsx:87`).                                                                                                                                                                                                                                                                     | Delete together and update stale docs examples.                                                    | High.                                                |
| `components/FileConflictDialog.tsx`                     | No runtime import or dynamic reference; conflict state is handled through the current tab/file-watch workflow.                                                                                                                                                                                                                                                           | Delete only after targeted conflict-flow tests pass.                                               | Medium-high; behavior test is mandatory.             |
| Unused barrel files                                     | `components/explorer/index.ts`, `components/inspector/index.ts`, `lib/dockview/index.ts`, and `types/index.ts` have no consumers.                                                                                                                                                                                                                                        | Delete instead of preserving speculative public APIs.                                              | High.                                                |
| Unused Milkdown files                                   | `nodes/blockquote.ts`, `nodes/paragraph.ts`, `plugins/paragraph-id-fixer.ts`, `plugins/separator-id-fixer.ts`, `pos-highlight/env-utils.ts`, `pos-highlight/merge-presets.ts`, and `pos-highlight/tokenizer-electron.ts` have no imports. The guide even says `paragraph-id-fixer` does not exist (`docs/guides/milkdown-plugin.md:83,95`), while the file still exists. | Delete after package tests and standalone type-check.                                              | High.                                                |
| Old kanji data modules                                  | `lib/linting/data/joyo-kanji.ts` and `jinmeiyo-kanji.ts` still have no code consumers and were intentionally unchanged by PR #1795. Legacy rule migration is tracked separately by #1791/#1792.                                                                                                                                                                          | Retain until #1791/#1792 decide their use; re-audit afterward rather than deleting during hygiene. | High confidence that deletion is premature.          |
| Tracked Obsidian workspace state                        | Four `docs/.obsidian/*.json` files remain tracked despite `.gitignore:72-73`.                                                                                                                                                                                                                                                                                            | Remove from Git index; keep local vault config ignored.                                            | High.                                                |

## Structural duplication worth consolidating

### 1. Legacy and active tab/chrome implementations

- Legacy: `components/TabBar.tsx:17` and `components/NewTabMenu.tsx:35`.
- Active: `lib/dockview/dockview-components.tsx:87` plus `components/EditorLayout.tsx:443`.

The divergence is historical, not a valid specialization. Keep Dockview and delete the inactive path.

### 2. Two NLP IPC registrations

- Legacy literal-channel implementation: `nlp-service/nlp-ipc-handlers.js:45-153`.
- Active typed-channel implementation: `electron/ipc/nlp-ipc.js:53-151`, registered by `electron/main.js:27`.

Keep the typed channel implementation. Do not retain a compatibility shim.

### 3. Ruleset runtime split across an editor package and application roots

- The main-thread proxy owns correlated load/unload requests: `packages/milkdown-plugin-japanese-novel/linting-plugin/worker/rule-runner-proxy.ts:268-303`.
- The worker imports the application registry/SDK/toolkit and owns the dynamic module lifecycle: `packages/milkdown-plugin-japanese-novel/linting-plugin/worker/linting.worker.ts:13-17,175-336`.
- The renderer coordinator is outside the package: `lib/linting/external-ruleset-loader.ts:60-157`, wired from `lib/editor-page/use-linting.ts:13,60-63`.

The worker/main split and failure-isolated runner swap are legitimate. The ownership split is not: a nominally standalone Milkdown package contains application-specific ruleset runtime code. Move the proxy, protocol, worker, external loader, and settings-facing adapter as one proofreading subsystem. Do not separate them during a move.

### 4. Export orchestration in both page and facade

- The page owns format-specific state and handlers: `app/page.tsx:630-951`.
- `lib/export/use-export.ts` is also the documented export facade and performs format dispatch.

Keep platform-specific generators, but move all dialog state and format dispatch behind one feature-level `useExportController()` entry. `app/page.tsx` should request an export, not know PDF/DOCX/EPUB details.

### 5. Generic service ownership

- `lib/tab-manager/` has 26 imports into `lib/services/`.
- `lib/services/` contains workspace services (file watcher/history/project file), dictionary services, notification infrastructure, and startup checks.
- Tests in `lib/services/__tests__/` import tab-manager types, while production services mostly do not, making the generic folder the source of test-level reverse coupling.

This is not one reusable service layer. Move each service to its owning feature and keep only truly cross-feature notifications/startup infrastructure outside feature folders.

### 6. Global context bucket

- `contexts/AuthContext.tsx` is owned by auth.
- `contexts/KeymapContext.tsx` is owned by commands/settings.
- `contexts/TerminalTabContext.tsx` and `DiffTabContext.tsx` are owned by workspace panels.
- `contexts/EditorSettingsContext.tsx` is owned by settings/editor configuration.

The common folder expresses React mechanism, not domain ownership. Colocate each provider with its feature and expose only its public hook/provider.

## Similarities that must remain specialized

| Similar paths                                                      | Why they remain separate                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/vfs/web-vfs.ts` and `lib/vfs/electron-vfs.ts`                 | Different trust and capability models: browser handles versus privileged IPC. Unify the interface, not the implementation.                                    |
| `lib/storage/web-storage.ts` and `lib/storage/electron-storage.ts` | IndexedDB and Electron/SQLite adapters are legitimate platform implementations of one contract.                                                               |
| `lib/export/epub-web.ts` and `lib/export/epub-exporter.ts`         | Browser Blob/ZIP and Node filesystem generation are platform specializations. Shared MDI conversion and metadata policy should remain common.                 |
| `electron/lib/path-utils.js` and `lib/vfs/path-utils.ts`           | Main-process security validation and renderer path convenience have different trust boundaries. Similar names do not justify sharing security-sensitive code. |
| Next NLP API routes and Electron NLP IPC                           | HTTP server and desktop IPC are separate transports over the same backend. Preserve both adapters.                                                            |

## Documentation and repository metadata drift

- `.github/copilot-instructions.md:107,274-275` references files that no longer exist (`lib/storage-service.ts`, `docs/STORAGE_ARCHITECTURE.md`, and `lib/storage-service-examples.ts`).
- `.github/agents/docs-updater.agent.md:47,51` references stale locations (`electron/nlp-service/`, `lib/hooks/use-tab-manager.ts`).
- Several architecture documents show old imports such as `@/lib/file-watcher` and `@/lib/notification-manager`; current files are under `lib/services/`.
- Root `MDI.md` is an intentional compatibility redirect (`docs/README.md:84-87`), but current `.github` instructions still treat it as canonical. Update references to `docs/MDI/spec.md`, then decide whether the redirect has any remaining external compatibility value.

## Non-source material

- Move editable `.psd`/`.ai` brand sources out of `public/` into `assets/source/branding/`; `public/` should contain only runtime-served outputs. Current source files account for roughly 13 MB and have no runtime references.
- Keep `public/dict/` (about 17 MB): Next NLP routes explicitly load it (`app/api/nlp/*/route.ts:12`).
- Keep `build/` release icons: `.gitignore:14-23` explicitly tracks selected installer assets.
- Local `dist-*`, `.next`, `reviews`, `.DS_Store`, and IDE state should be cleaned from disk but never committed.
