/**
 * Tests for extended SnapshotType retention / prune rules (Wave 2: G2 + G3).
 * 拡張 SnapshotType（pre-close / pre-external-reload / restore-point）の
 * retention / prune ルールを純関数として検証する。
 */

import { describe, it, expect } from "vitest";
import {
  shouldCreateSnapshot,
  shouldPrune,
  getPruneSet,
  AUTO_SNAPSHOT_INTERVAL_MS,
  RETENTION_DAYS,
  MAX_SNAPSHOTS,
} from "../history-policy";
import type { SnapshotEntry, SnapshotType, HistoryIndex } from "../history-policy";

function makeEntry(
  type: SnapshotType,
  timestamp: number,
  id: string = `id-${Math.random().toString(36).slice(2)}`,
): SnapshotEntry {
  return {
    id,
    timestamp,
    filename: `test.[${timestamp}].history`,
    sourcePath: "/p/main.mdi",
    displayName: "main.mdi",
    type,
    characterCount: 100,
    fileSize: 100,
    checksum: "abc123",
  };
}

describe("history-policy: extended SnapshotType", () => {
  describe("shouldCreateSnapshot — throttle bypass for non-auto", () => {
    const now = 1_000_000;
    const recent = now - 1000; // 1 second ago

    it("auto: throttled within interval (returns false)", () => {
      expect(shouldCreateSnapshot("/p/file.mdi", recent, "auto", now)).toBe(false);
    });

    it("auto: allowed after interval", () => {
      const old = now - AUTO_SNAPSHOT_INTERVAL_MS - 1;
      expect(shouldCreateSnapshot("/p/file.mdi", old, "auto", now)).toBe(true);
    });

    it("auto: allowed when no previous snapshot", () => {
      expect(shouldCreateSnapshot("/p/file.mdi", undefined, "auto", now)).toBe(true);
    });

    it("manual: always allowed regardless of throttle", () => {
      expect(shouldCreateSnapshot("/p/file.mdi", recent, "manual", now)).toBe(true);
    });

    it("milestone: always allowed", () => {
      expect(shouldCreateSnapshot("/p/file.mdi", recent, "milestone", now)).toBe(true);
    });

    it("pre-close: always allowed (no throttle)", () => {
      expect(shouldCreateSnapshot("/p/file.mdi", recent, "pre-close", now)).toBe(true);
    });

    it("pre-external-reload: always allowed (no throttle)", () => {
      expect(shouldCreateSnapshot("/p/file.mdi", recent, "pre-external-reload", now)).toBe(true);
    });

    it("restore-point: always allowed (no throttle)", () => {
      expect(shouldCreateSnapshot("/p/file.mdi", recent, "restore-point", now)).toBe(true);
    });
  });

  describe("shouldPrune — retention by type", () => {
    const now = Date.now();
    const recent = now - 1000;
    const old = now - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000;

    it("auto recent: not pruned", () => {
      expect(shouldPrune(makeEntry("auto", recent), now, RETENTION_DAYS)).toBe(false);
    });

    it("auto old: pruned", () => {
      expect(shouldPrune(makeEntry("auto", old), now, RETENTION_DAYS)).toBe(true);
    });

    it("manual old: never pruned (permanent retention)", () => {
      expect(shouldPrune(makeEntry("manual", old), now, RETENTION_DAYS)).toBe(false);
    });

    it("milestone old: never pruned", () => {
      expect(shouldPrune(makeEntry("milestone", old), now, RETENTION_DAYS)).toBe(false);
    });

    it("pre-close old: never pruned (permanent retention for user-initiated)", () => {
      expect(shouldPrune(makeEntry("pre-close", old), now, RETENTION_DAYS)).toBe(false);
    });

    it("restore-point old: never pruned (permanent retention)", () => {
      expect(shouldPrune(makeEntry("restore-point", old), now, RETENTION_DAYS)).toBe(false);
    });

    it("pre-external-reload old: pruned (same retention as auto)", () => {
      // pre-external-reload は throttle はしないが、retention は auto と同じ扱い
      expect(shouldPrune(makeEntry("pre-external-reload", old), now, RETENTION_DAYS)).toBe(true);
    });
  });

  describe("getPruneSet — count-based pruning", () => {
    function makeIndex(entries: SnapshotEntry[]): HistoryIndex {
      return { snapshots: entries, maxSnapshots: MAX_SNAPSHOTS, retentionDays: RETENTION_DAYS };
    }

    it("under MAX_SNAPSHOTS: no prune", () => {
      const now = Date.now();
      const entries = Array.from({ length: 50 }, (_, i) =>
        makeEntry("auto", now - i * 1000, `id-${i}`),
      );
      expect(getPruneSet(makeIndex(entries), now)).toEqual([]);
    });

    it("over MAX_SNAPSHOTS for auto: prunes oldest auto entries", () => {
      const now = Date.now();
      // Create MAX_SNAPSHOTS + 5 auto entries
      const entries = Array.from({ length: MAX_SNAPSHOTS + 5 }, (_, i) =>
        makeEntry("auto", now - i * 1000, `auto-${i}`),
      );
      const pruned = getPruneSet(makeIndex(entries), now);
      // Should prune at least 5 (the oldest)
      expect(pruned.length).toBeGreaterThanOrEqual(5);
      // All pruned should be "auto" type
      expect(pruned.every((e) => e.type === "auto")).toBe(true);
    });

    it("never prunes manual entries even when many exist", () => {
      const now = Date.now();
      const entries = Array.from({ length: MAX_SNAPSHOTS + 20 }, (_, i) =>
        makeEntry("manual", now - i * 1000, `manual-${i}`),
      );
      const pruned = getPruneSet(makeIndex(entries), now);
      expect(pruned.filter((e) => e.type === "manual")).toEqual([]);
    });

    it("never prunes milestone entries", () => {
      const now = Date.now();
      const entries = [
        ...Array.from({ length: MAX_SNAPSHOTS + 10 }, (_, i) =>
          makeEntry("auto", now - i * 1000, `auto-${i}`),
        ),
        makeEntry("milestone", now - 500_000, "milestone-1"),
      ];
      const pruned = getPruneSet(makeIndex(entries), now);
      expect(pruned.find((e) => e.type === "milestone")).toBeUndefined();
    });

    it("never prunes pre-close entries", () => {
      const now = Date.now();
      const entries = [
        ...Array.from({ length: MAX_SNAPSHOTS + 10 }, (_, i) =>
          makeEntry("auto", now - i * 1000, `auto-${i}`),
        ),
        makeEntry("pre-close", now - 500_000, "pre-close-1"),
      ];
      const pruned = getPruneSet(makeIndex(entries), now);
      expect(pruned.find((e) => e.type === "pre-close")).toBeUndefined();
    });

    it("never prunes restore-point entries", () => {
      const now = Date.now();
      const entries = [
        ...Array.from({ length: MAX_SNAPSHOTS + 10 }, (_, i) =>
          makeEntry("auto", now - i * 1000, `auto-${i}`),
        ),
        makeEntry("restore-point", now - 500_000, "restore-1"),
      ];
      const pruned = getPruneSet(makeIndex(entries), now);
      expect(pruned.find((e) => e.type === "restore-point")).toBeUndefined();
    });
  });
});
