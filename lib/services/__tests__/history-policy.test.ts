/**
 * Unit tests for history-policy.ts (pure functions — no IO, no mocks needed).
 *
 * Coverage targets:
 * - shouldCreateSnapshot: throttle for "auto", bypass for all non-auto types
 * - shouldPrune: retention window, permanent types never pruned
 * - getPruneSet: count-based + time-based, ordering, permanent preservation
 * - Utility: formatTimestamp, calculateChecksum, calculateByteSize,
 *             isAutoSnapshotFilename, getSnapshotSourceKey, getSnapshotDisplayName,
 *             makeSnapshotStorageLabel, createDefaultHistoryIndex
 */

import { describe, it, expect, beforeAll } from "vitest";

import {
  shouldCreateSnapshot,
  shouldPrune,
  getPruneSet,
  formatTimestamp,
  calculateChecksum,
  calculateByteSize,
  isAutoSnapshotFilename,
  getSnapshotSourceKey,
  getSnapshotDisplayName,
  makeSnapshotStorageLabel,
  createDefaultHistoryIndex,
  AUTO_SNAPSHOT_INTERVAL_MS,
  MAX_SNAPSHOTS,
  RETENTION_DAYS,
} from "@/lib/services/history-policy";

import type { SnapshotEntry, HistoryIndex, SnapshotType } from "@/lib/services/history-policy";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makeEntry(overrides: Partial<SnapshotEntry> = {}): SnapshotEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    filename: "test.mdi.[20260101120000_0000].history",
    sourcePath: "test.mdi",
    displayName: "test.mdi",
    type: "auto",
    characterCount: 10,
    fileSize: 10,
    checksum: "abc",
    ...overrides,
  };
}

function makeIndex(snapshots: SnapshotEntry[], overrides?: Partial<HistoryIndex>): HistoryIndex {
  return {
    snapshots,
    maxSnapshots: MAX_SNAPSHOTS,
    retentionDays: RETENTION_DAYS,
    ...overrides,
  };
}

// Mock crypto.subtle for checksum tests in jsdom
beforeAll(() => {
  const encoder = new TextEncoder();
  const mockDigest = async (_algo: string, data: BufferSource): Promise<ArrayBuffer> => {
    const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer);
    const hash = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i++) {
      hash[i % 32] ^= bytes[i];
      hash[(i + 1) % 32] = (hash[(i + 1) % 32] + bytes[i]) & 0xff;
    }
    return hash.buffer;
  };
  // only patch subtle to avoid breaking other crypto usage
  void encoder; // satisfy lint
  Object.defineProperty(globalThis, "crypto", {
    value: {
      ...globalThis.crypto,
      subtle: { digest: mockDigest },
      randomUUID: () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    configurable: true,
  });
});

// -----------------------------------------------------------------------
// shouldCreateSnapshot
// -----------------------------------------------------------------------

describe("shouldCreateSnapshot", () => {
  const FIVE_MIN = AUTO_SNAPSHOT_INTERVAL_MS;

  describe("auto type — throttle enforced", () => {
    it("returns true when lastSnapshotAt is undefined (no prior snapshot)", () => {
      expect(shouldCreateSnapshot("a.mdi", undefined, "auto")).toBe(true);
    });

    it("returns false when elapsed time is less than 5 minutes", () => {
      const now = Date.now();
      const lastSnapshotAt = now - FIVE_MIN + 1000; // 1 second short
      expect(shouldCreateSnapshot("a.mdi", lastSnapshotAt, "auto", now)).toBe(false);
    });

    it("returns true at exactly the 5-minute boundary", () => {
      const now = Date.now();
      const lastSnapshotAt = now - FIVE_MIN;
      expect(shouldCreateSnapshot("a.mdi", lastSnapshotAt, "auto", now)).toBe(true);
    });

    it("returns true when elapsed time exceeds 5 minutes", () => {
      const now = Date.now();
      const lastSnapshotAt = now - FIVE_MIN - 1;
      expect(shouldCreateSnapshot("a.mdi", lastSnapshotAt, "auto", now)).toBe(true);
    });

    it("returns false with a future lastSnapshotAt (clock skew / corrected clock)", () => {
      const now = Date.now();
      const lastSnapshotAt = now + 10_000; // 10 seconds in the future
      expect(shouldCreateSnapshot("a.mdi", lastSnapshotAt, "auto", now)).toBe(false);
    });

    it("returns true when lastSnapshotAt is 0 (epoch)", () => {
      const now = Date.now();
      expect(shouldCreateSnapshot("a.mdi", 0, "auto", now)).toBe(true);
    });
  });

  describe("non-auto types — always allowed (bypass throttle)", () => {
    const bypassTypes: SnapshotType[] = [
      "manual",
      "milestone",
      "pre-close",
      "pre-external-reload",
      "restore-point",
    ];

    for (const type of bypassTypes) {
      it(`${type}: returns true even with a very recent lastSnapshotAt`, () => {
        const now = Date.now();
        const justNow = now - 100; // 100 ms ago — within throttle window
        expect(shouldCreateSnapshot("a.mdi", justNow, type, now)).toBe(true);
      });

      it(`${type}: returns true when lastSnapshotAt is undefined`, () => {
        expect(shouldCreateSnapshot("a.mdi", undefined, type)).toBe(true);
      });
    }
  });

  it("sourcePath is part of the signature but does not affect the result", () => {
    const now = Date.now();
    // Two different paths, same timing — both should return true
    expect(shouldCreateSnapshot("a.mdi", undefined, "auto", now)).toBe(true);
    expect(shouldCreateSnapshot("b.mdi", undefined, "auto", now)).toBe(true);
  });
});

// -----------------------------------------------------------------------
// shouldPrune
// -----------------------------------------------------------------------

describe("shouldPrune", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const retentionDays = 90;

  it("returns false for a recent auto entry (within retention)", () => {
    const now = Date.now();
    const entry = makeEntry({ type: "auto", timestamp: now - DAY_MS });
    expect(shouldPrune(entry, now, retentionDays)).toBe(false);
  });

  it("returns true for an old auto entry (beyond retention)", () => {
    const now = Date.now();
    const entry = makeEntry({ type: "auto", timestamp: now - retentionDays * DAY_MS - 1 });
    expect(shouldPrune(entry, now, retentionDays)).toBe(true);
  });

  it("returns false at exactly the retention boundary", () => {
    const now = Date.now();
    const entry = makeEntry({ type: "auto", timestamp: now - retentionDays * DAY_MS });
    expect(shouldPrune(entry, now, retentionDays)).toBe(false);
  });

  it("returns true one millisecond past the retention boundary", () => {
    const now = Date.now();
    const entry = makeEntry({ type: "auto", timestamp: now - retentionDays * DAY_MS - 1 });
    expect(shouldPrune(entry, now, retentionDays)).toBe(true);
  });

  describe("permanent types — never pruned regardless of age", () => {
    const permanentTypes: SnapshotType[] = ["manual", "milestone", "pre-close", "restore-point"];
    const veryOldTimestamp = 0; // epoch — definitely outside retention

    for (const type of permanentTypes) {
      it(`${type}: returns false even at epoch timestamp`, () => {
        const now = Date.now();
        const entry = makeEntry({ type, timestamp: veryOldTimestamp });
        expect(shouldPrune(entry, now, retentionDays)).toBe(false);
      });
    }
  });

  it("pre-external-reload is prunable (not permanent)", () => {
    const now = Date.now();
    const entry = makeEntry({ type: "pre-external-reload", timestamp: 0 });
    expect(shouldPrune(entry, now, retentionDays)).toBe(true);
  });
});

// -----------------------------------------------------------------------
// getPruneSet
// -----------------------------------------------------------------------

describe("getPruneSet", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("returns empty array when no snapshots exist", () => {
    const index = makeIndex([]);
    expect(getPruneSet(index)).toEqual([]);
  });

  it("returns empty array when all snapshots are within limits", () => {
    const now = Date.now();
    const snapshots = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ type: "auto", timestamp: now - i * 1000 }),
    );
    const index = makeIndex(snapshots, { maxSnapshots: 100, retentionDays: 90 });
    expect(getPruneSet(index, now)).toEqual([]);
  });

  describe("count-based pruning", () => {
    it("prunes oldest auto entries when count exceeds maxSnapshots", () => {
      const now = Date.now();
      const maxSnapshots = 3;
      // 5 auto entries: newest first
      const snapshots = Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          type: "auto",
          timestamp: now - i * 1000, // newest = index 0
        }),
      );
      const index = makeIndex(snapshots, { maxSnapshots, retentionDays: 90 });
      const pruneSet = getPruneSet(index, now);

      // Should prune the 2 oldest (index 3 and 4)
      expect(pruneSet).toHaveLength(2);
      const prunedIds = new Set(pruneSet.map((e) => e.id));
      expect(prunedIds.has(snapshots[3].id)).toBe(true);
      expect(prunedIds.has(snapshots[4].id)).toBe(true);
    });

    it("does NOT prune when count equals maxSnapshots", () => {
      const now = Date.now();
      const maxSnapshots = 3;
      const snapshots = Array.from({ length: 3 }, (_, i) =>
        makeEntry({ type: "auto", timestamp: now - i * 1000 }),
      );
      const index = makeIndex(snapshots, { maxSnapshots, retentionDays: 90 });
      expect(getPruneSet(index, now)).toEqual([]);
    });
  });

  describe("time-based pruning", () => {
    it("prunes auto entries older than retentionDays", () => {
      const now = Date.now();
      const retentionDays = 90;
      const old = makeEntry({ type: "auto", timestamp: now - retentionDays * DAY_MS - 1 });
      const recent = makeEntry({ type: "auto", timestamp: now - DAY_MS });
      const index = makeIndex([old, recent], { maxSnapshots: 100, retentionDays });
      const pruneSet = getPruneSet(index, now);

      expect(pruneSet).toHaveLength(1);
      expect(pruneSet[0].id).toBe(old.id);
    });

    it("prunes pre-external-reload entries older than retentionDays", () => {
      const now = Date.now();
      const old = makeEntry({ type: "pre-external-reload", timestamp: 0 });
      const index = makeIndex([old], { maxSnapshots: 100, retentionDays: 90 });
      const pruneSet = getPruneSet(index, now);
      expect(pruneSet).toHaveLength(1);
      expect(pruneSet[0].id).toBe(old.id);
    });
  });

  describe("permanent types never in prune set", () => {
    const permanentTypes: SnapshotType[] = ["manual", "milestone", "pre-close", "restore-point"];

    it("does not prune permanent types even when exceeding maxSnapshots", () => {
      const now = Date.now();
      const maxSnapshots = 1;
      // Create 5 permanent entries — all should be preserved
      const snapshots = permanentTypes.flatMap((type) =>
        Array.from({ length: 2 }, (_, i) => makeEntry({ type, timestamp: now - i * 1000 })),
      );
      const index = makeIndex(snapshots, { maxSnapshots, retentionDays: 90 });
      expect(getPruneSet(index, now)).toEqual([]);
    });

    it("does not prune permanent types even at epoch timestamp", () => {
      const now = Date.now();
      const snapshots = permanentTypes.map((type) => makeEntry({ type, timestamp: 0 }));
      const index = makeIndex(snapshots, { maxSnapshots: 0, retentionDays: 0 });
      expect(getPruneSet(index, now)).toEqual([]);
    });
  });

  it("count + time pruning union: returns superset of both criteria", () => {
    const now = Date.now();
    const DAY = DAY_MS;
    const retentionDays = 90;
    const maxSnapshots = 2;

    const veryOld = makeEntry({ type: "auto", timestamp: now - retentionDays * DAY - 1 }); // time-based candidate
    const recent1 = makeEntry({ type: "auto", timestamp: now - DAY });
    const recent2 = makeEntry({ type: "auto", timestamp: now - 2 * DAY });
    const recent3 = makeEntry({ type: "auto", timestamp: now - 3 * DAY }); // count-based candidate

    const index = makeIndex([veryOld, recent1, recent2, recent3], {
      maxSnapshots,
      retentionDays,
    });
    const pruneSet = getPruneSet(index, now);

    // veryOld and recent3 should both be in the prune set
    const prunedIds = new Set(pruneSet.map((e) => e.id));
    expect(prunedIds.has(veryOld.id)).toBe(true);
    expect(prunedIds.has(recent3.id)).toBe(true);
    expect(prunedIds.has(recent1.id)).toBe(false);
    expect(prunedIds.has(recent2.id)).toBe(false);
  });

  it("only auto + pre-external-reload entries appear in the prune set", () => {
    const now = Date.now();
    // Mix of types, all at epoch (very old, beyond any retention)
    const entries: SnapshotEntry[] = [
      makeEntry({ type: "auto", timestamp: 0 }),
      makeEntry({ type: "pre-external-reload", timestamp: 0 }),
      makeEntry({ type: "manual", timestamp: 0 }),
      makeEntry({ type: "milestone", timestamp: 0 }),
      makeEntry({ type: "pre-close", timestamp: 0 }),
      makeEntry({ type: "restore-point", timestamp: 0 }),
    ];
    const index = makeIndex(entries, { maxSnapshots: 0, retentionDays: 0 });
    const pruneSet = getPruneSet(index, now);
    const types = new Set(pruneSet.map((e) => e.type));

    // Only pruneable types should appear
    expect(types.has("auto")).toBe(true);
    expect(types.has("pre-external-reload")).toBe(true);
    expect(types.has("manual")).toBe(false);
    expect(types.has("milestone")).toBe(false);
    expect(types.has("pre-close")).toBe(false);
    expect(types.has("restore-point")).toBe(false);
  });
});

// -----------------------------------------------------------------------
// formatTimestamp
// -----------------------------------------------------------------------

describe("formatTimestamp", () => {
  it("produces a 19-character string (YYYYMMDDHHmmss_xxxx)", () => {
    const formatted = formatTimestamp(Date.now());
    expect(formatted).toHaveLength(19);
  });

  it("matches the expected pattern YYYYMMDDHHMMSS_NNNN", () => {
    const formatted = formatTimestamp(new Date("2026-06-15T14:30:45").getTime());
    expect(formatted).toMatch(/^\d{14}_\d{4}$/);
    expect(formatted.slice(0, 8)).toBe("20260615");
  });

  it("produces different values on repeated calls (random suffix)", () => {
    const ts = Date.now();
    const results = new Set(Array.from({ length: 20 }, () => formatTimestamp(ts)));
    // With 10000 possible suffixes the probability of all 20 being identical is ~0
    expect(results.size).toBeGreaterThan(1);
  });
});

// -----------------------------------------------------------------------
// calculateChecksum
// -----------------------------------------------------------------------

describe("calculateChecksum", () => {
  it("returns a 64-character hex string", async () => {
    const checksum = await calculateChecksum("hello");
    expect(checksum).toHaveLength(64);
    expect(checksum).toMatch(/^[0-9a-f]+$/);
  });

  it("returns the same checksum for identical content", async () => {
    const a = await calculateChecksum("same content");
    const b = await calculateChecksum("same content");
    expect(a).toBe(b);
  });

  it("returns different checksums for different content", async () => {
    const a = await calculateChecksum("content A");
    const b = await calculateChecksum("content B");
    expect(a).not.toBe(b);
  });

  it("handles empty string", async () => {
    const checksum = await calculateChecksum("");
    expect(checksum).toHaveLength(64);
  });
});

// -----------------------------------------------------------------------
// calculateByteSize
// -----------------------------------------------------------------------

describe("calculateByteSize", () => {
  it("returns 0 for empty string", () => {
    expect(calculateByteSize("")).toBe(0);
  });

  it("returns byte count equal to char count for ASCII", () => {
    expect(calculateByteSize("hello")).toBe(5);
  });

  it("returns 3 bytes per CJK character in UTF-8", () => {
    expect(calculateByteSize("漢字")).toBe(6);
  });

  it("byte count is greater than char count for multi-byte content", () => {
    const content = "日本語テスト";
    expect(calculateByteSize(content)).toBeGreaterThan(content.length);
  });
});

// -----------------------------------------------------------------------
// isAutoSnapshotFilename
// -----------------------------------------------------------------------

describe("isAutoSnapshotFilename", () => {
  it("returns true for a filename with .__auto__. marker", () => {
    expect(isAutoSnapshotFilename("main.mdi.[20260101120000_0000].__auto__.history")).toBe(true);
  });

  it("returns false for a filename without .__auto__. marker", () => {
    expect(isAutoSnapshotFilename("main.mdi.[20260101120000_0000].history")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isAutoSnapshotFilename("")).toBe(false);
  });
});

// -----------------------------------------------------------------------
// getSnapshotSourceKey
// -----------------------------------------------------------------------

describe("getSnapshotSourceKey", () => {
  it("returns sourcePath when present", () => {
    expect(
      getSnapshotSourceKey({ sourcePath: "chapters/intro.mdi", sourceFile: "intro.mdi" }),
    ).toBe("chapters/intro.mdi");
  });

  it("falls back to sourceFile when sourcePath is empty", () => {
    expect(getSnapshotSourceKey({ sourcePath: "", sourceFile: "intro.mdi" })).toBe("intro.mdi");
  });

  it("returns empty string when both are absent", () => {
    expect(getSnapshotSourceKey({})).toBe("");
  });
});

// -----------------------------------------------------------------------
// getSnapshotDisplayName
// -----------------------------------------------------------------------

describe("getSnapshotDisplayName", () => {
  it("returns displayName when set", () => {
    expect(
      getSnapshotDisplayName({ displayName: "My File", sourcePath: "path/to/my-file.mdi" }),
    ).toBe("My File");
  });

  it("derives display name from the last segment of sourcePath", () => {
    expect(getSnapshotDisplayName({ sourcePath: "chapters/intro.mdi" })).toBe("intro.mdi");
  });

  it("handles Windows backslash paths", () => {
    expect(getSnapshotDisplayName({ sourcePath: "C:\\Users\\test\\novel.mdi" })).toBe("novel.mdi");
  });

  it("returns source key directly when there are no path separators", () => {
    expect(getSnapshotDisplayName({ sourcePath: "flat.mdi" })).toBe("flat.mdi");
  });
});

// -----------------------------------------------------------------------
// makeSnapshotStorageLabel
// -----------------------------------------------------------------------

describe("makeSnapshotStorageLabel", () => {
  it("strips Windows drive letter from the label", () => {
    const label = makeSnapshotStorageLabel("C:\\Users\\test\\novel.mdi", "novel.mdi");
    expect(label).not.toContain("C:");
  });

  it("replaces colons and other Windows-invalid chars with __", () => {
    const label = makeSnapshotStorageLabel("C:\\path<with>special|chars.mdi", "chars.mdi");
    expect(label).not.toMatch(/[:<>"|?*]/);
  });

  it("uses only the last 2 path segments", () => {
    const label = makeSnapshotStorageLabel("a/b/c/d/e/target.mdi", "target.mdi");
    expect(label).toContain("e__target.mdi");
    expect(label).not.toContain("a__b");
  });

  it("stays within 100 characters", () => {
    const longPath = `a/${"x".repeat(200)}/novel.mdi`;
    const label = makeSnapshotStorageLabel(longPath, "novel.mdi");
    expect(label.length).toBeLessThanOrEqual(100);
  });

  it("appends hash suffix when truncating long labels", () => {
    const longPath = `a/${"x".repeat(200)}/novel.mdi`;
    const label = makeSnapshotStorageLabel(longPath, "novel.mdi");
    // Truncated labels end with _<8hex>
    expect(label).toMatch(/_[0-9a-f]{8}$/);
  });

  it("returns consistent results for the same input", () => {
    const path = "chapters/intro.mdi";
    expect(makeSnapshotStorageLabel(path, "intro.mdi")).toBe(
      makeSnapshotStorageLabel(path, "intro.mdi"),
    );
  });
});

// -----------------------------------------------------------------------
// createDefaultHistoryIndex
// -----------------------------------------------------------------------

describe("createDefaultHistoryIndex", () => {
  it("returns an index with empty snapshots array", () => {
    const idx = createDefaultHistoryIndex();
    expect(idx.snapshots).toEqual([]);
  });

  it("uses MAX_SNAPSHOTS constant", () => {
    expect(createDefaultHistoryIndex().maxSnapshots).toBe(MAX_SNAPSHOTS);
  });

  it("uses RETENTION_DAYS constant", () => {
    expect(createDefaultHistoryIndex().retentionDays).toBe(RETENTION_DAYS);
  });
});

// -----------------------------------------------------------------------
// Constants sanity
// -----------------------------------------------------------------------

describe("exported constants", () => {
  it("AUTO_SNAPSHOT_INTERVAL_MS is 5 minutes in ms", () => {
    expect(AUTO_SNAPSHOT_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it("MAX_SNAPSHOTS is 100", () => {
    expect(MAX_SNAPSHOTS).toBe(100);
  });

  it("RETENTION_DAYS is 90", () => {
    expect(RETENTION_DAYS).toBe(90);
  });
});
