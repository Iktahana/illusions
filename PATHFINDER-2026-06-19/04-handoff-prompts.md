# Make-plan handoff prompts

Run these in order. Each prompt is intentionally limited to one reviewable system.

## 1. Hygiene and dead-code removal

```text
/make-plan Prepare the repository hygiene PR described by PATHFINDER-2026-06-19/02-duplication-report.md. Delete only high-confidence legacy files, untrack docs/.obsidian workspace state, move editable PSD/AI sources from public/ to assets/source/branding/, and repair stale documentation references. Treat FileConflictDialog and unused kanji datasets as verification-gated. Do not change runtime behavior, introduce compatibility shims, or delete public/dict and tracked build icons. Include type-check, lint, full tests, Next build, Electron bundle, and git-ls-files verification.
```

## 2. Workspace slice

```text
/make-plan Consolidate workspace ownership under features/workspace/ using PATHFINDER-2026-06-19/01-flowcharts/workspace-files.md and 03-unified-proposal.md. Move lib/tab-manager, lib/project, lib/dockview, workspace-owned services (project-file, file-watcher, history), explorer/history/project UI, and Diff/Terminal tab contexts. Preserve save-executor as the single save path and getProjectFileService/getVFS contracts. Rewrite exact current callers in app/page.tsx, components/EditorLayout.tsx, and lib/editor-page. Do not change behavior, create a second persistence path, or merge browser and Electron VFS implementations.
```

## 3. Editor and proofreading package boundary

```text
/make-plan Split editor and proofreading ownership using PATHFINDER-2026-06-19/01-flowcharts/editor-mdi.md and proofreading-nlp.md. Move application-coupled linting-plugin/ and pos-highlight/ out of packages/milkdown-plugin-japanese-novel into features/proofreading/. Leave the package with MDI/Milkdown schema and formatting only, and enforce zero @/ imports with its standalone tsconfig. Preserve RuleRunner worker/main split, dictionary-not-ready warning/disable behavior, ctx.toolkit usage, and ruleset module distribution. Do not duplicate rule engines or hardcode dictionary mappings.
```

## 4. Export slice

```text
/make-plan Consolidate export ownership under features/export/ using PATHFINDER-2026-06-19/01-flowcharts/export.md. Create one useExportController public entry, move format dialog state and PDF/DOCX/EPUB dispatch out of app/page.tsx:630-951, retain browser and Electron generators as separate adapters, and keep shared MDI conversion common. Update electron/ipc/file-ipc.js call sites without broadening IPC authority. Do not merge Node and browser implementations or add a format registry when an explicit switch is sufficient.
```

## 5. Settings, commands, and auth slices

```text
/make-plan Move settings, commands, and auth to feature-owned directories using PATHFINDER-2026-06-19/01-flowcharts/settings-auth-commands.md. Colocate EditorSettingsContext with settings, KeymapContext/keymap/menu actions with commands, and AuthContext/lib/auth/account UI with auth. Keep app/auth and app/api/auth as Next route boundaries and keep web/Electron session adapters separate. Replace generic contexts imports with feature public APIs. Do not create a new global context bucket or a universal settings store.
```

## 6. Application shell and remaining cleanup

```text
/make-plan Reduce app/page.tsx to a thin route and move composition to application/EditorPage.tsx using PATHFINDER-2026-06-19/01-flowcharts/application-shell.md. Extract remaining search, editor, startup, and notification ownership into their feature/application directories. Remove empty components/, contexts/, lib/, types/ only when grep proves no live imports. Add enforceable import-boundary checks and update ARCHITECTURE.md, docs links, GitHub agents/workflows, Vitest coverage paths, and Copilot instructions. Do not keep legacy aliases or combine this structural work with behavior changes.
```

## 7. Electron internal organization

```text
/make-plan Reorganize Electron internals using PATHFINDER-2026-06-19/01-flowcharts/electron-platform.md. Keep electron/main.js and electron/preload.js stable entrypoints required by scripts/bundle-electron.mjs:30-69. Move managers into electron/services/{dictionary,rulesets,updates,windows} and policies/channels/bridge into electron/shared/{security,ipc}; update IPC imports and tests atomically. Add Electron lint coverage. Preserve contextIsolation, nodeIntegration=false, typed channels, and input validation. Do not expose new preload methods or share renderer path helpers with privileged security validation.
```
