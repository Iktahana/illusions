/**
 * Tests for snapshot-utils with extended SnapshotType (Wave 2).
 * pre-close / pre-external-reload / restore-point ラベルとバッジ色の検証。
 */

import { describe, it, expect } from "vitest";
import {
  formatTimeJa,
  getSnapshotTypeLabel,
  getSnapshotTypeBadgeClass,
  getDateKey,
  formatDateGroupLabel,
} from "../snapshot-utils";
import type { SnapshotType } from "@/lib/services/history-service";

describe("snapshot-utils — extended SnapshotType", () => {
  describe("getSnapshotTypeLabel", () => {
    it("auto → 自動", () => expect(getSnapshotTypeLabel("auto")).toBe("自動"));
    it("manual → 手動", () => expect(getSnapshotTypeLabel("manual")).toBe("手動"));
    it("milestone → ﾏｲﾙｽﾄｰﾝ", () => expect(getSnapshotTypeLabel("milestone")).toBe("ﾏｲﾙｽﾄｰﾝ"));
    it("pre-close → 閉じる前", () => expect(getSnapshotTypeLabel("pre-close")).toBe("閉じる前"));
    it("pre-external-reload → 外部更新前", () =>
      expect(getSnapshotTypeLabel("pre-external-reload")).toBe("外部更新前"));
    it("restore-point → 復元前", () =>
      expect(getSnapshotTypeLabel("restore-point")).toBe("復元前"));

    it("exhaustive switch — all SnapshotType variants produce a non-empty label", () => {
      const allTypes: SnapshotType[] = [
        "auto",
        "manual",
        "milestone",
        "pre-close",
        "pre-external-reload",
        "restore-point",
      ];
      for (const t of allTypes) {
        const label = getSnapshotTypeLabel(t);
        expect(label).toBeTruthy();
        expect(typeof label).toBe("string");
        expect(label.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getSnapshotTypeBadgeClass", () => {
    it("returns a distinct class for each type", () => {
      const allTypes: SnapshotType[] = [
        "auto",
        "manual",
        "milestone",
        "pre-close",
        "pre-external-reload",
        "restore-point",
      ];
      const classes = new Set(allTypes.map(getSnapshotTypeBadgeClass));
      // All 6 types should produce 6 unique badge classes
      expect(classes.size).toBe(6);
    });

    it("includes tailwind bg / text color tokens", () => {
      const allTypes: SnapshotType[] = [
        "auto",
        "manual",
        "milestone",
        "pre-close",
        "pre-external-reload",
        "restore-point",
      ];
      for (const t of allTypes) {
        const cls = getSnapshotTypeBadgeClass(t);
        expect(cls).toMatch(/bg-/);
        expect(cls).toMatch(/text-/);
        // Dark mode variants
        expect(cls).toMatch(/dark:/);
      }
    });

    it("auto badge uses neutral zinc tone (no emphasis)", () => {
      expect(getSnapshotTypeBadgeClass("auto")).toContain("zinc");
    });

    it("manual badge uses blue tone (user-emphasis)", () => {
      expect(getSnapshotTypeBadgeClass("manual")).toContain("blue");
    });

    it("milestone badge uses amber tone", () => {
      expect(getSnapshotTypeBadgeClass("milestone")).toContain("amber");
    });

    it("pre-close uses orange tone (warning-adjacent)", () => {
      expect(getSnapshotTypeBadgeClass("pre-close")).toContain("orange");
    });

    it("pre-external-reload uses purple tone (external signal)", () => {
      expect(getSnapshotTypeBadgeClass("pre-external-reload")).toContain("purple");
    });

    it("restore-point uses green tone (safety net)", () => {
      expect(getSnapshotTypeBadgeClass("restore-point")).toContain("green");
    });
  });

  describe("formatTimeJa", () => {
    it("returns empty string for timestamp 0", () => {
      expect(formatTimeJa(0)).toBe("");
    });

    it("formats a timestamp as YYYY/MM/DD HH:mm", () => {
      // 2026-05-23 14:30:00 JST as a positive timestamp
      const d = new Date(2026, 4, 23, 14, 30, 0); // month is 0-indexed
      const formatted = formatTimeJa(d.getTime());
      expect(formatted).toMatch(/2026\/05\/23 \d{2}:30/);
    });
  });

  describe("getDateKey", () => {
    it("returns YYYY-MM-DD format", () => {
      const d = new Date(2026, 0, 5).getTime();
      expect(getDateKey(d)).toBe("2026-01-05");
    });
  });

  describe("formatDateGroupLabel", () => {
    it("returns the date key as-is (placeholder behavior)", () => {
      expect(formatDateGroupLabel("2026-05-23")).toBe("2026-05-23");
    });
  });
});
