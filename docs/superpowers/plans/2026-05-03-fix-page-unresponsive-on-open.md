# Fix: Page Unresponsive on Open (Google Drive Projects)

## Goal

Fix the three-layer bug that causes illusions to appear frozen when opening a project from
Google Drive. All three must be fixed together — patching one in isolation leaves regressions.

## Bug Map

| ID  | File                                          | Line | Root Cause                                                                                                                                                                                                                       |
| --- | --------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `lib/services/ignored-corrections-service.ts` | 52   | `loadIgnoredCorrections` passes `{ create: true }` to `getDirectoryHandle` during a **read** — triggers an unnecessary `vfs:mkdir` IPC to Google Drive                                                                           |
| B2  | `lib/services/ignored-corrections-service.ts` | 59   | Electron IPC strips `.code` from re-thrown errors; `code === "ENOENT"` always evaluates to `false` → error leaks to hook's `.catch()` with a noisy console warning                                                               |
| B3  | `electron/ipc/vfs-ipc.js`                     | 333  | **Primary cause of "無響應":** `dialogApprovedPaths` is in-memory only; every app restart clears it. `vfs:set-root` then shows a native macOS sheet dialog (blocking the main window) every time the user opens a recent project |

## Architecture

```
electron/lib/approved-vfs-paths.js   ← NEW: persistence layer for approved paths
electron/ipc/vfs-ipc.js              ← Updated: seed new windows from persisted list;
                                               persist on dialog confirmation
lib/services/ignored-corrections-service.ts ← Updated: B1 + B2 fixes
```

### Security model for B3

The fix does **not** add a bypass in `vfs:set-root`. Instead:

- Persisted approved paths are loaded at startup into main-process memory only.
- When a **new window** is created (`web-contents-created`), the main process pre-seeds
  that window's `dialogApprovedPaths` entry with all persisted paths.
- `vfs:set-root` code is unchanged — it still checks `dialogApprovedPaths[webContentsId]`,
  which now contains pre-seeded paths for known projects.
- The renderer **cannot** call any IPC to add paths to `persistedApprovedPaths`.
  Only the main process (inside `vfs:open-directory` and `vfs:set-root` confirmed handlers)
  can write to it.

This preserves the per-window trust boundary while eliminating the repeated dialog.

## Tech Stack

- Node.js built-in `fs` (sync read at startup, sync write in debounced callback)
- Existing `toForwardSlash` from `electron/lib/path-utils.js`
- No new npm dependencies

---

## Task 1 — Fix `ignored-corrections-service.ts` (B1 + B2)

**File**: `lib/services/ignored-corrections-service.ts`

### Steps

- [ ] Add `isNotFoundError` helper **above** the `// Service` section comment:

```typescript
/**
 * Returns true if the error indicates a missing file or directory.
 * Checks `.code` (native Node.js throw) and `.message` (Electron IPC strips `.code`
 * when serialising errors across the process boundary; Node.js ENOENT messages
 * always contain the literal string "ENOENT: no such file or directory").
 */
function isNotFoundError(err: unknown): boolean {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") return true;
  if (err instanceof Error && err.message.includes("ENOENT: no such file or directory"))
    return true;
  return false;
}
```

- [ ] In `loadIgnoredCorrections()` (line 52), change:

```typescript
// BEFORE
const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
// AFTER
const illusionsDir = await rootDir.getDirectoryHandle(".illusions");
```

- [ ] In `loadIgnoredCorrections()` catch block (line 59), change:

```typescript
// BEFORE
if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
// AFTER
if (isNotFoundError(err)) return [];
```

### Expected outcome

- No `vfs:mkdir` IPC call on Google Drive during corrections load.
- ENOENT silently swallowed → returns `[]`.
- JSON corruption / permission errors still re-throw.

---

## Task 2 — Create `electron/lib/approved-vfs-paths.js`

**File**: `electron/lib/approved-vfs-paths.js` (new)

```javascript
/* eslint-disable no-console */
/**
 * Persistent approved-VFS-paths store for the Electron main process.
 *
 * Paths approved via native dialog are persisted to:
 *   <userData>/approved-vfs-paths.json
 * so that new windows are pre-seeded and vfs:set-root skips the re-prompt.
 *
 * The renderer cannot write to this list — only main-process IPC handlers
 * (vfs:open-directory, vfs:set-root post-dialog) call addApprovedPath.
 *
 * Capacity: 500 entries with LRU eviction (delete-then-reinsert keeps recency).
 */

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const MAX_ENTRIES = 500;

/** @type {Set<string>} Forward-slash normalized approved paths, insertion-order = LRU oldest→newest */
let approvedPaths = new Set();
let saveTimer = null;

function getFilePath() {
  return path.join(app.getPath("userData"), "approved-vfs-paths.json");
}

/**
 * Load persisted approved paths synchronously. Call once inside registerVFSHandlers()
 * before ipcMain.handle registrations fire. Failure is non-fatal.
 */
function loadApprovedPaths() {
  try {
    const raw = fs.readFileSync(getFilePath(), "utf-8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      approvedPaths = new Set(arr.filter((p) => typeof p === "string"));
    }
  } catch {
    approvedPaths = new Set();
  }
}

/** Iterate over all persisted approved paths (for window seeding). */
function getApprovedPaths() {
  return approvedPaths;
}

/**
 * Record a newly approved path and schedule a debounced write to disk.
 * Uses delete-then-reinsert to refresh LRU recency for existing entries.
 * @param {string} normalizedPath - Forward-slash normalized absolute path
 */
function addApprovedPath(normalizedPath) {
  // Refresh recency: delete + reinsert moves entry to end of Set order (newest)
  approvedPaths.delete(normalizedPath);
  approvedPaths.add(normalizedPath);
  // Evict oldest (first in insertion order) when over capacity
  if (approvedPaths.size > MAX_ENTRIES) {
    approvedPaths.delete(approvedPaths.values().next().value);
  }
  scheduleSave();
}

/**
 * Flush pending writes synchronously. Call on app before-quit to prevent data loss
 * if the debounce timer has not yet fired.
 */
function flushApprovedPaths() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.writeFileSync(getFilePath(), JSON.stringify([...approvedPaths]), "utf-8");
  } catch (err) {
    console.error("[approved-vfs-paths] Failed to flush on quit:", err);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(getFilePath(), JSON.stringify([...approvedPaths]), "utf-8");
    } catch (err) {
      console.error("[approved-vfs-paths] Failed to persist approved paths:", err);
    }
  }, 300);
}

module.exports = { loadApprovedPaths, getApprovedPaths, addApprovedPath, flushApprovedPaths };
```

### Notes

- Synchronous `readFileSync` at startup eliminates race conditions (tiny file, called once).
- LRU is correct: `delete` then `add` refreshes insertion position; eviction deletes the oldest (first) entry.
- `getApprovedPaths()` returns a reference to the live Set — callers must iterate only, not mutate.

---

## Task 3 — Update `electron/ipc/vfs-ipc.js` (B3 fix)

**File**: `electron/ipc/vfs-ipc.js`

### Steps

- [ ] Add require at top (after the existing requires on lines 7–15):

```javascript
const {
  loadApprovedPaths,
  getApprovedPaths,
  addApprovedPath,
  flushApprovedPaths,
} = require("../lib/approved-vfs-paths");
```

- [ ] At the **start** of `registerVFSHandlers()` (line 20, before `const allowedRoots`), add:

```javascript
// Load persisted approved paths before any IPC handlers can fire.
loadApprovedPaths();

// Flush debounced writes on clean shutdown.
app.once("before-quit", flushApprovedPaths);
```

- [ ] Replace the existing `app.on("web-contents-created")` cleanup block (lines 360-364) with the following. **Important**: `registerVFSHandlers()` is called after the main window already exists, so we must seed existing webContents immediately AND attach the listener for future windows:

```javascript
// Seed helper — reused for existing and future windows
function seedWindowFromPersistedApprovals(webContentsId) {
  const windowApproved = getWindowApprovedPaths(webContentsId);
  for (const approvedPath of getApprovedPaths()) {
    windowApproved.set(approvedPath, true);
  }
}

// Seed all windows already open when registerVFSHandlers() runs
// (the main window is created before registerVFSHandlers fires)
for (const contents of webContents.getAllWebContents()) {
  seedWindowFromPersistedApprovals(contents.id);
}

// Seed future windows (e.g. second windows, devtools, etc.)
app.on("web-contents-created", (_, contents) => {
  seedWindowFromPersistedApprovals(contents.id);
  contents.on("destroyed", () => {
    allowedRoots.delete(contents.id);
    dialogApprovedPaths.delete(contents.id);
  });
});
```

Note: `webContents` is already imported at line 7 of `vfs-ipc.js`.

- [ ] In `vfs:open-directory` handler (line 106), after `approveDialogPath(event.sender.id, dirPath)`, add:

```javascript
addApprovedPath(toForwardSlash(dirPath));
```

- [ ] In `vfs:set-root` handler (line 352), after `approveDialogPath(event.sender.id, confirmedPath)`, add:

```javascript
addApprovedPath(toForwardSlash(confirmedPath));
```

_(No change to the `vfs:set-root` dialog gate itself — line 333 is untouched.)_

### Expected outcome

- First open of a new project: native dialog appears once → path persisted → window's `dialogApprovedPaths` seeded.
- Subsequent opens (after restart): new window is pre-seeded → `dialogApprovedPaths.has(resolved)` → no dialog.
- `vfs:set-root` security check at line 333 is **unchanged**.
- Renderer cannot call any IPC to influence `persistedApprovedPaths`.

---

## Task 4 — Manual Verification

- [ ] Open illusions, open a project on Google Drive (dialog appears first time → confirm)
- [ ] Check `~/Library/Application Support/illusions/approved-vfs-paths.json` contains the path (forward-slash normalized)
- [ ] Quit and reopen illusions; open same project from recent files → **no dialog**
- [ ] Confirm no `[VFS IPC] mkdir failed` in console for `.illusions` during project load
- [ ] Confirm no ENOENT warning for `ignored-corrections.json` in console
- [ ] Windows: verify paths stored as `C:/Users/...` in JSON (forward-slash)

---

## Review History

### Iteration 1 (fallback: Claude reviewer, Codex unavailable → Codex R1–R4)

**R1 (CRITICAL)** — PARTIAL ACCEPT  
_Issue_: Global JSON bypass in `vfs:set-root` weakens per-window trust boundary (#1043).  
_Response_: Revised architecture. Instead of adding `!isApprovedPath(resolved)` to `vfs:set-root`, we now pre-seed `dialogApprovedPaths` for each new window at `web-contents-created` time. `vfs:set-root` line 333 is unchanged. The renderer cannot add to `persistedApprovedPaths` via any IPC — only main-process native dialog callbacks can.

**R2 (IMPORTANT)** — REJECT  
_Issue_: Persisting from `vfs:open-directory` whitelists any native-picker result.  
_Response_: `vfs:open-directory` already requires the user to select a folder via native picker. An explicit native picker selection is semantically equivalent to "user approves this path." Persisting it prevents a repeat dialog on next `vfs:set-root` for the same folder. The concern is mitigated by `isDeniedPath` validation in `vfs:set-root`.

**R3 (IMPORTANT)** — ACCEPT  
_Issue_: Set-based approach did not refresh recency for existing entries.  
_Applied_: `addApprovedPath` now deletes then reinserts the entry to refresh LRU position. Eviction removes the oldest (first in Set iteration order).

**R4 (IMPORTANT)** — PARTIAL ACCEPT  
_Issue_: `message.includes("ENOENT")` is too broad.  
_Applied_: Narrowed to `message.includes("ENOENT: no such file or directory")` — this is the exact Node.js ENOENT message prefix and cannot appear in file path strings in practice. Full IPC error-code preservation is deferred to the VFS refactoring.

### Iteration 2 — Q5 (NEW ISSUE) — ACCEPT

_Issue_: `web-contents-created` listener misses the initial window (created before `registerVFSHandlers()` fires).  
_Applied_: Added `webContents.getAllWebContents()` loop immediately after `loadApprovedPaths()` to seed existing windows synchronously. The `web-contents-created` listener handles future windows. `webContents` is already imported in `vfs-ipc.js:7`.
