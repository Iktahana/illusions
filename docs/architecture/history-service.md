# History Service Documentation

Version history with auto/manual/milestone snapshots and character-level diff for Japanese text.

---

## Overview

The history service provides a local version history system for documents. It creates periodic snapshots (auto, manual, or milestone) and stores them alongside the project in the `.illusions/history/` directory. Users can browse past versions, compare diffs, and restore any snapshot with integrity verification via SHA-256 checksums.

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `lib/history-service.ts` | ~760 | Snapshot creation, restoration, pruning, and management |
| `lib/diff-service.ts` | ~67 | Character-level diff computation and statistics |

### Features

- Three snapshot types: auto (timer-based), manual (user-initiated), milestone (bookmarked)
- SHA-256 checksum verification on restore
- Character-level diff optimized for Japanese text
- Automatic pruning by count and age with milestone protection
- Thread-safe via AsyncMutex for concurrent operations
- Singleton access via `getHistoryService()`

---

## Architecture

### System Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Editor (use-file-io.ts)                                  │
│                                                           │
│  After save, if 5+ min elapsed:                          │
│    historyService.createSnapshot(...)                     │
│                                                           │
│  User action:                                            │
│    historyService.createSnapshot(..., "manual")          │
│    historyService.toggleBookmark(snapshotId)             │
│    historyService.restoreSnapshot(snapshotId)            │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  HistoryService (Singleton via getHistoryService())       │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ AsyncMutex — ensures atomic read/write operations   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  Methods:                                                │
│  - createSnapshot     - restoreSnapshot                  │
│  - getSnapshots       - deleteSnapshot                   │
│  - pruneOldSnapshots  - pruneSnapshotsPerFile            │
│  - shouldCreateSnapshot  - toggleBookmark                │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  .illusions/history/                                      │
│                                                           │
│  index.json                                              │
│  ├── snapshots: SnapshotEntry[]                          │
│  ├── maxSnapshots: 100                                   │
│  └── retentionDays: 90                                   │
│                                                           │
│  main.[20260225T1430].__auto__.history                   │
│  main.[20260225T1500].history                            │
│  main.[20260225T1530].__auto__.history                   │
│  ...                                                      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  DiffService (lib/diff-service.ts)                        │
│                                                           │
│  computeDiff(oldText, newText) → DiffChunk[]             │
│  getDiffStats(chunks) → { added, removed, unchanged }   │
│                                                           │
│  Uses: diff.diffChars() — character-level granularity    │
└──────────────────────────────────────────────────────────┘
```

### Storage Structure

```
project-root/
└── .illusions/
    └── history/
        ├── index.json                                  (metadata index)
        ├── main.[20260225T1430].__auto__.history       (auto snapshot)
        ├── main.[20260225T1500].history                (manual snapshot)
        └── main.[20260225T1530].__auto__.history       (auto snapshot)
```

#### Filename Format

```
{sourceFile}.[{YYYYMMDDHHMM}]{.__auto__}.history
```

- `sourceFile`: Original filename (e.g., `main`)
- `YYYYMMDDHHMM`: Timestamp of snapshot creation
- `.__auto__`: Suffix present only for auto-snapshots

### Pruning Strategy

| Rule | Condition | Action |
|------|-----------|--------|
| Count limit | Total snapshots > 100 | Delete oldest non-milestone snapshots |
| Age limit | Snapshot older than 90 days | Delete non-milestone snapshots |
| Per-file limit | Auto-snapshots per file > 100 | Delete oldest auto-snapshots for that file |
| Milestone protection | Snapshot type is "milestone" | **NEVER deleted** by pruning |

All pruning operations are atomic via `AsyncMutex`.

---

## Key Interfaces and Types

```typescript
/** Snapshot classification */
type SnapshotType = "auto" | "manual" | "milestone";

/** A single snapshot entry in the history index */
interface SnapshotEntry {
  id: string;               // UUID v4
  timestamp: number;        // Unix timestamp (ms)
  filename: string;         // Snapshot file name on disk
  sourceFile: string;       // Original source file name
  type: SnapshotType;
  label?: string;           // Optional user-provided label
  characterCount: number;   // Character count at snapshot time
  fileSize: number;         // File size in bytes
  checksum: string;         // SHA-256 hash for integrity verification
}

/** The history index stored in index.json */
interface HistoryIndex {
  snapshots: SnapshotEntry[];
  maxSnapshots: number;     // Default: 100
  retentionDays: number;    // Default: 90
}

/** Result of a snapshot restore operation */
interface RestoreResult {
  success: boolean;
  content?: string;         // Restored content (on success)
  error?: string;           // Error message (on failure)
}

/** A single diff chunk */
interface DiffChunk {
  type: "added" | "removed" | "unchanged";
  value: string;
}

/** Aggregated diff statistics */
interface DiffStats {
  addedChars: number;
  removedChars: number;
  unchangedChars: number;
}
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_MAX_SNAPSHOTS` | `100` | Maximum total snapshots in history |
| `DEFAULT_RETENTION_DAYS` | `90` | Days before non-milestone snapshots are pruned |
| `AUTO_SNAPSHOT_INTERVAL_MS` | `300000` | Minimum interval between auto-snapshots (5 minutes) |
| `MAX_SNAPSHOTS_PER_FILE` | `100` | Maximum auto-snapshots per source file |

---

## Code Examples

### Creating Snapshots

```typescript
import { getHistoryService } from "@/lib/history-service";

const historyService = getHistoryService();

// Auto-snapshot (called after save if 5+ minutes elapsed)
await historyService.createSnapshot({
  content: editorContent,
  sourceFile: "main.mdi",
  type: "auto",
});

// Manual snapshot (user-initiated via menu or shortcut)
await historyService.createSnapshot({
  content: editorContent,
  sourceFile: "main.mdi",
  type: "manual",
  label: "Before major revision",
});
```

### Checking Whether to Create a Snapshot

```typescript
const shouldCreate = historyService.shouldCreateSnapshot("main.mdi");
// Returns true if AUTO_SNAPSHOT_INTERVAL_MS (5 min) has elapsed
// since the last auto-snapshot for this file

if (shouldCreate) {
  await historyService.createSnapshot({
    content: editorContent,
    sourceFile: "main.mdi",
    type: "auto",
  });
}
```

### Restoring a Snapshot

```typescript
const snapshots = await historyService.getSnapshots("main.mdi");
const targetSnapshot = snapshots[0]; // Most recent

const result = await historyService.restoreSnapshot(targetSnapshot.id);

if (result.success) {
  // SHA-256 checksum verified, content is safe to use
  setEditorContent(result.content!);
} else {
  showError(`Restore failed: ${result.error}`);
}
```

### Bookmarking (Milestone Toggle)

```typescript
// Toggle a snapshot between its current type and "milestone"
await historyService.toggleBookmark(snapshotId);

// Milestones are protected from automatic pruning
```

### Computing Diffs

```typescript
import { computeDiff, getDiffStats } from "@/lib/diff-service";

const chunks = computeDiff(oldContent, newContent);
// chunks: DiffChunk[] — character-level diff using diff.diffChars()

const stats = getDiffStats(chunks);
// stats: { addedChars: 42, removedChars: 15, unchangedChars: 3200 }
```

### Integration with File Save

```typescript
// Inside use-file-io.ts (simplified)
async function handleSave(path: string, content: string) {
  // Write file to disk...
  await writeFile(path, content);

  // Create history snapshot if enough time has elapsed
  const historyService = getHistoryService();
  if (historyService.shouldCreateSnapshot(path)) {
    await historyService.createSnapshot({
      content,
      sourceFile: path,
      type: "auto",
    });
  }
}
```

---

## Integrity Verification

When restoring a snapshot, the history service:

1. Reads the snapshot file from `.illusions/history/`
2. Computes the SHA-256 hash of the file contents
3. Compares the computed hash with the stored `checksum` in `index.json`
4. Returns the content only if the checksums match
5. Returns an error if verification fails (file corrupted or tampered)

---

## Related Documentation

- [File Watcher](./file-watcher.md) -- External change detection (complements history)
- [Storage System](./storage-system.md) -- Application state persistence
- [Project Lifecycle](./project-lifecycle.md) -- `.illusions/` directory management and project structure

---

**Last Updated**: 2026-02-25
**Version**: 1.0.0
