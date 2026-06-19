# Repository structure cleanup plan

Date: 2026-06-19
Status: proposed
Architecture evidence: [`PATHFINDER-2026-06-19/`](../../../PATHFINDER-2026-06-19/00-features.md)

## Outcome

Replace horizontal catch-all directories with feature ownership while keeping Next.js routes, Electron security boundaries, and build entrypoints stable. The end state is described in `PATHFINDER-2026-06-19/03-unified-proposal.md`.

This is an incremental refactor, not a rewrite. Each implementation PR must be independently mergeable and must either be a pure move/deletion PR or a behavior PR, never both.

## Success criteria

- `app/` contains Next.js routes and route scaffolding, not application feature orchestration.
- `app/page.tsx` is a thin import/render boundary; the 1,490-line coordinator is decomposed into feature controllers and `application/EditorPage.tsx`.
- `components/`, `contexts/`, `lib/editor-page/`, and `lib/services/` no longer exist as generic ownership buckets.
- Features expose intentionally small public APIs under `features/<name>/index.ts`.
- Browser/Electron renderer adapters are explicit under `platform/`; Electron main code remains behind preload/IPC.
- `packages/milkdown-plugin-japanese-novel/` compiles independently and has zero imports from `@/` application code.
- Dead code and tracked local metadata are removed; runtime assets and generated outputs are clearly separated.
- Import-boundary rules prevent the old structure from returning.

## Phase 0 — Baseline and documentation discovery

### Work

1. Read and treat these as constraints, not suggestions:
   - `ARCHITECTURE.md:3-35` for current process/directory contracts.
   - `next.config.ts:9-14` for service-worker paths.
   - `scripts/bundle-electron.mjs:30-69` for stable Electron entrypoints.
   - `docs/architecture/storage-system.md` and `docs/architecture/vfs.md` for storage/VFS facades.
   - `docs/architecture/tab-manager.md` and `docs/architecture/history-service.md` for save/history behavior.
   - `docs/architecture/ipc-security.md` for privilege boundaries.
   - `docs/guides/linting-rules.md` plus repository `AGENTS.md` for ruleset/dictionary fail-safe requirements.
2. Record baseline outputs for `npm run type-check`, `npm run lint`, `npm test`, `npm run build`, and `npm run bundle:electron`.
3. Add or run a read-only import-graph report that includes static imports, dynamic imports, CommonJS `require`, worker URLs, and asset path references.
4. Capture baseline tracked/generated checks and `public/` size.

### Verification

- Baseline failures are documented before any move; new PRs may not add failures.
- No code or files move in Phase 0.
- The feature inventory matches `PATHFINDER-2026-06-19/00-features.md` or is explicitly amended with evidence.

### Guards

- Do not infer dead code from TypeScript imports alone; dynamic imports and string-loaded assets exist (`app/page.tsx:856,930,1087`, `app/layout.tsx:29`).
- Do not use generated `dist-*`, `.next`, or local worktree artifacts as source evidence.

## Phase 1 — Repository hygiene and proven legacy deletion

### Work

Create one behavior-neutral PR.

1. Delete high-confidence legacy code from `PATHFINDER-2026-06-19/02-duplication-report.md`:
   - `nlp-service/nlp-ipc-handlers.js`
   - `components/AiStatusIndicator.tsx`
   - `components/Navbar.tsx`
   - `components/NewTabMenu.tsx`
   - `components/TabBar.tsx`
   - unused barrel files
   - unused Milkdown nodes/plugins/helpers
2. Handle `components/FileConflictDialog.tsx` separately inside the same PR only if file-conflict tests prove the active flow is complete without it.
3. For `joyo-kanji.ts` and `jinmeiyo-kanji.ts`, choose exactly one:
   - wire them into an active documented rule with tests, or
   - delete them and remove their claims from `docs/guides/linting-rules.md`.
4. Remove the four tracked `docs/.obsidian/*.json` workspace files from the Git index; `.gitignore:72-73` already defines the intended policy.
5. Move editable `.psd`/`.ai` sources from `public/` to `assets/source/branding/`. Keep generated PNG/SVG runtime assets in `public/` and installer assets in `build/`.
6. Repair known stale paths in `.github/copilot-instructions.md`, `.github/agents/docs-updater.agent.md`, and affected architecture documents.
7. Provide an optional local cleanup command for ignored `dist-electron/`, `dist-main/`, `.next/`, `reviews/`, and `.DS_Store`; do not make it run automatically during install/build.

### Documentation references

- Preserve generated/build ignore intent from `.gitignore:9-44,65-87`.
- Preserve `public/dict` because Next NLP routes load it from `app/api/nlp/*/route.ts:12`.
- Preserve root `MDI.md` until all repository references point to `docs/MDI/spec.md`; `docs/README.md:84-87` marks it as a compatibility file.

### Verification

- `rg` finds no remaining references to every deleted code symbol/path.
- Package standalone type-check and package tests pass after Milkdown file deletion.
- Targeted tab/file-watch conflict tests pass if `FileConflictDialog.tsx` is deleted.
- `git ls-files 'docs/.obsidian/**'` returns no files.
- `git ls-files 'dist-*' '.next/**' 'reviews/**' '*.DS_Store'` returns no files.
- `npm run type-check && npm run lint && npm test && npm run build && npm run bundle:electron` all pass.

### Guards

- Do not delete `public/dict/`, `build/` installer assets, `public/theme-init.js`, dynamic export modules, or root MDI compatibility docs without reference proof.
- Do not replace deletion with deprecation wrappers.

## Phase 2 — Establish enforceable target boundaries

### Work

1. Create empty ownership roots only as they receive real files: `application/`, `features/`, `platform/`, `shared/`, and `assets/source/branding/`.
2. Add `scripts/check-import-boundaries.mjs` using the existing Node toolchain; avoid a new dependency unless the script cannot reliably resolve imports.
3. Encode these rules:
   - `shared/**` cannot import `features/**`, `application/**`, or `electron/**`.
   - `packages/**` cannot import `@/` application modules.
   - renderer code cannot import `electron/**` main modules.
   - feature-private paths cannot be imported by other features; only `features/<name>` public entrypoints are allowed.
4. Add matching ESLint `no-restricted-imports` rules where static enforcement is possible.
5. Stop excluding all Electron code from lint. Add a Node/CommonJS override and keep only generated/binary paths ignored (`eslint.config.mjs:23-35`).
6. Add the boundary script to the normal quality workflow before large moves begin.

### Verification

- Include fixture violations or a script self-test proving each forbidden edge fails.
- Current code may use a temporary explicit allowlist, but every entry needs an owner and removal phase. The allowlist count must only decrease.
- `npm run lint` covers renderer TypeScript and Electron JavaScript.

### Guards

- Do not create two long-lived aliases for old/new paths.
- Do not add a universal dependency-injection container or registry.
- Do not create empty “architecture” layers with no concrete owner.

## Phase 3 — Shared primitives and platform adapters

### Work

Move the least coupled files first using `git mv`; update imports and tests in the same commit.

1. `shared/ui/`: only primitives used by at least three features, such as `GlassDialog`, `ConfirmDialog`, `ContextMenu`, `ResizablePanel`, `ErrorBoundary`, and notification primitives.
2. `shared/lib/`: environment-neutral utilities such as `async-mutex`, `lru-cache`, `hash-string`, and text codec helpers.
3. Move domain utilities out of `lib/utils` to owners:
   - readability/vocabulary/Genji analysis → proofreading/inspection owner;
   - fonts → editor/settings owner;
   - runtime feature detection → application/platform owner.
4. Establish platform adapters:
   - browser VFS/storage/auth/download adapters under `platform/browser/`;
   - Electron renderer VFS/storage/auth/NLP clients and global API types under `platform/electron-renderer/`.
5. Keep shared interfaces with their owning feature or in `shared/types` only if at least three features consume them.

### Documentation references

- Copy the existing unified storage entry pattern from `docs/architecture/storage-system.md` (`getStorageService()`).
- Copy the VFS interface/factory behavior from `docs/architecture/vfs.md`; do not invent methods.
- Preserve preload-only privileged access from `docs/architecture/ipc-security.md`.

### Verification

- No file in `shared/` imports React feature state, Next routes, or Electron main code.
- Browser tests and Electron storage/VFS tests pass separately.
- The boundary allowlist shrinks.

### Guards

- Similar browser/Electron implementations remain separate adapters.
- Do not move feature policy into `shared/` to avoid choosing an owner.

## Phase 4 — Workspace vertical slice

### Work

Create `features/workspace/{model,ui}/` and expose a deliberate `features/workspace/index.ts`.

1. Move `lib/tab-manager/`, `lib/project/`, and `lib/dockview/` into the workspace slice.
2. Move workspace-owned services from `lib/services/`: project file, file watcher, history policy/store/facade, and diff service.
3. Move workspace UI: explorer, history panel, project wizard, permission prompt, dockview panel components, diff view, empty editor state, and upgrade banner where applicable.
4. Move `DiffTabContext` and `TerminalTabContext` to their owning workspace/terminal subfeatures.
5. Keep these established single paths:
   - `save-executor.ts` for all writes;
   - project file facade/VFS for filesystem access;
   - history facade over policy/store;
   - Dockview as the only tab/pane UI.
6. Update `app/page.tsx`, `EditorLayout`, `lib/editor-page` callers, tests, architecture docs, and GitHub path filters atomically.

### Documentation references

- `docs/architecture/tab-manager.md`
- `docs/architecture/project-lifecycle.md`
- `docs/architecture/file-watcher.md`
- `docs/architecture/history-service.md`
- `docs/architecture/dockview-layout.md`

### Verification

- Run all existing tab-manager, project, VFS, file-watch, history, dockview, and relevant component tests.
- `rg '@/lib/(tab-manager|project|dockview)|@/lib/services/(project-file|file-watcher|history|diff)'` returns no production imports.
- Save/open/restore/conflict Electron smoke tests pass.

### Guards

- Do not redesign state while moving it.
- Do not recreate legacy `TabBar` or add a second save/history path.
- Do not weaken hash/suppression semantics in file watching.

## Phase 5 — Editor, proofreading, dictionary, and search slices

### Work

1. Create `features/editor/{model,ui}/` from editor components and editor-owned hooks/policies.
2. Split `lib/editor-page/` by real ownership:
   - editor lifecycle, selection, statistics, formatting, display/power policy → editor;
   - project lifecycle/file opening/recent projects → workspace;
   - search state/matching/project-search worker → search;
   - linting/ignored corrections → proofreading;
   - startup checks → application.
3. Create `features/proofreading/{model,ui,worker}/` from `lib/linting`, correction UI, lint hooks, and the current Milkdown linting plugin/worker.
4. Move `pos-highlight/` to proofreading/editor integration because it imports application NLP/cache code.
5. Leave `packages/milkdown-plugin-japanese-novel/` with MDI/Milkdown syntax, schemas, formatting, and serialization only.
6. Create `features/dictionary/` from `lib/dict`, user-dictionary service, dictionary UI, and dictionary-owned startup integration.
7. Create `features/search/` from SearchDialog/SearchResults, match/search workers, and search-only state.
8. Update the ruleset authoring documentation path consistently. If `docs/ruleset/` exists in the implementation branch, preserve it as canonical; otherwise reconcile repository instructions with `docs/guides/linting-rules.md` before moving code.

### Documentation references

- `docs/guides/milkdown-plugin.md`
- `docs/MDI/spec.md` and `docs/MDI/implementation.md`
- `docs/architecture/correction-ai-system.ja.md`
- `docs/architecture/nlp-backend-architecture.md`
- `docs/architecture/dictionary-and-ignored-corrections.md`
- Ruleset constraints from repository `AGENTS.md`.

### Verification

- `npx tsc -p packages/milkdown-plugin-japanese-novel/tsconfig.json --noEmit` passes with zero `@/` imports in the package.
- Run all MDI round-trip, clipboard, lint rule, worker proxy, NLP, dictionary, search, and statistics tests.
- Test dictionary state `!== "ready"`: dictionary-dependent rules warn and disable; `ctx.toolkit.dict` returns safe empty results.
- No NFKC/mapping behavior is replaced with hardcoded tables.

### Guards

- Keep rules distributed as ruleset code modules, not folded into UI or a JSON mega-registry.
- Reuse `ctx.toolkit` normalization/dedup behavior.
- Keep the worker/main split; move it as one feature, do not duplicate its engine.

## Phase 6 — Export, settings, commands, auth, and terminal slices

### Work

1. Export:
   - move `lib/export` and export UI to `features/export/`;
   - introduce one `useExportController()` facade;
   - move format-specific state/handlers out of `app/page.tsx:630-951`;
   - retain explicit browser and Electron adapters.
2. Settings:
   - move settings UI and `EditorSettingsContext` together;
   - expose typed settings hooks, not the whole internal provider state.
3. Commands:
   - move keymap registry/context and menu actions together;
   - keep the shared menu template as the single menu definition and platform-specific handlers as adapters.
4. Auth:
   - move `lib/auth`, `AuthContext`, and account UI together;
   - keep `app/auth` and `app/api/auth` as route boundaries;
   - retain separate web/Electron session adapters.
5. Terminal:
   - move terminal panel, settings, state/hooks, and renderer IPC client under one feature;
   - leave PTY process authority in Electron main.

### Documentation references

- `docs/architecture/export-system.md`
- `docs/architecture/keymap-system.md`
- `docs/guides/keyboard-shortcuts.md`
- `docs/architecture/authentication-flow.md`
- `docs/architecture/terminal-system.md`

### Verification

- Run export equivalence tests for MDI/PDF/DOCX/EPUB and both browser/Electron paths.
- Run keymap/menu drift tests, auth session boundary tests, and terminal unit/smoke tests.
- `app/page.tsx` no longer contains format-specific export or terminal process logic.

### Guards

- No universal settings store.
- No generalized export registry when an explicit switch is sufficient.
- No PTY or token-storage authority in renderer UI.

## Phase 7 — Thin application shell and Electron internal layout

### Work

1. Move the remaining renderer composition to `application/EditorPage.tsx`; leave `app/page.tsx` as a thin route import/render.
2. Move providers and startup coordination from generic contexts/hooks into `application/providers` and `application/startup` only when they truly compose multiple features.
3. Reorganize Electron internals without moving its entrypoints:
   - managers → `electron/services/{dictionary,rulesets,updates,windows}`;
   - channels/bridge → `electron/shared/ipc`;
   - path/URL/approval/index-lock policies → `electron/shared/security`.
4. Update `scripts/bundle-electron.mjs`, Electron tests, JSDoc type references, docs, and workflows only as required by internal paths; entrypoint lines remain stable.
5. Remove now-empty `components/`, `contexts/`, `lib/`, `types/`, and `nlp-service/` directories.
6. Rewrite `ARCHITECTURE.md` to match the target dependency direction and make `docs/architecture/` the detailed source of truth.

### Verification

- `app/page.tsx` contains route-level composition only and has a small, reviewable import list.
- `find components contexts lib types nlp-service` reports no existing legacy roots.
- Electron IPC, security policy, bundling, and packaging tests pass.
- `npm run lint` covers Electron after the move.
- GitHub workflow path filters and documentation agents reference the new directories.

### Guards

- Do not relocate `electron/main.js` or `electron/preload.js` merely for symmetry.
- Do not merge Electron security helpers with renderer utilities.
- Do not expose new preload capabilities during a structure-only phase.

## Final verification

Run from a clean worktree:

1. `npm run type-check`
2. `npm run lint`
3. `npm test`
4. `npm run test:coverage` and verify coverage includes `features/**`, `shared/**`, and `platform/**` rather than obsolete `lib/**` only (`vitest.config.ts:18-27`).
5. `npm run build`
6. `npm run bundle:electron`
7. Platform packaging smoke checks appropriate to the release branch.
8. `npx tsc -p packages/milkdown-plugin-japanese-novel/tsconfig.json --noEmit`
9. Boundary checker with zero temporary allowlist entries.
10. Grep checks for old roots/paths in code, docs, `.github`, scripts, and configs.
11. Confirm no generated/local artifacts are tracked and `public/` contains only served assets.

## PR sequence and review policy

Use one PR per phase or smaller feature slice. Recommended order:

1. Hygiene/dead code/assets/docs
2. Boundary tooling and Electron lint coverage
3. Shared primitives/platform adapters
4. Workspace
5. Editor + proofreading/package boundary
6. Dictionary + search
7. Export
8. Settings + commands + auth + terminal
9. Application shell + Electron internals + final docs

Every PR must show:

- exact move/delete list;
- import-boundary delta;
- targeted and full verification results;
- explicit statement that behavior did or did not change;
- updated architecture/documentation references in the same PR.
