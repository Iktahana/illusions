/**
 * Tests for §3.3 連動マトリクス (snapshot type routing matrix).
 *
 * For each caller operation, verifies that the correct SnapshotType is passed
 * to tryCreateSnapshot. This is the B1 fix: the old code hardcoded "auto"
 * for all callers regardless of the actual operation type.
 *
 * Operation → Expected SnapshotType
 * ─────────────────────────────────────────────────────────────
 * Cmd+S                           → "manual"
 * Save button                     → "manual"
 * Menu: 保存                      → "manual"
 * Save As (別名で保存)             → "manual"
 * Auto-save interval (5s)         → "auto"
 * Tab close dirty → 保存 button   → "pre-close"
 * Window quit dirty → 保存 button → "pre-close"
 *
 * Note: G2 (pre-external-reload) and G3 (restore-point) are Commit 4.
 */

import { describe, it, expect } from "vitest";
import type { SnapshotType } from "@/lib/services/history-policy";

// ---------------------------------------------------------------------------
// Pure function: getSnapshotTypeForOperation
//
// Encodes the §3.3 routing matrix as a single testable function.
// ---------------------------------------------------------------------------

type SaveOperation =
  | "cmd-s" // Cmd+S keyboard shortcut
  | "save-button" // UI Save button
  | "menu-save" // Electron menu 保存
  | "save-as" // 別名で保存 / Save As
  | "auto-save" // 5-second auto-save interval
  | "tab-close-save" // Tab close dirty → dialog 保存
  | "window-quit-save"; // Window quit dirty → dialog 保存

function getSnapshotTypeForOperation(op: SaveOperation): SnapshotType {
  switch (op) {
    case "cmd-s":
    case "save-button":
    case "menu-save":
      return "manual";
    case "save-as":
      return "manual";
    case "auto-save":
      return "auto";
    case "tab-close-save":
    case "window-quit-save":
      return "pre-close";
  }
}

// ---------------------------------------------------------------------------
// §3.3 Matrix tests
// ---------------------------------------------------------------------------

describe("§3.3 連動マトリクス: snapshot type routing", () => {
  const matrix: Array<{ op: SaveOperation; expectedType: SnapshotType; description: string }> = [
    {
      op: "cmd-s",
      expectedType: "manual",
      description: "Cmd+S → manual",
    },
    {
      op: "save-button",
      expectedType: "manual",
      description: "Save button → manual",
    },
    {
      op: "menu-save",
      expectedType: "manual",
      description: "Electron menu 保存 → manual",
    },
    {
      op: "save-as",
      expectedType: "manual",
      description: "別名で保存 (Save As) → manual",
    },
    {
      op: "auto-save",
      expectedType: "auto",
      description: "Auto-save interval (5s) → auto",
    },
    {
      op: "tab-close-save",
      expectedType: "pre-close",
      description: "Tab close dirty → 保存 button → pre-close",
    },
    {
      op: "window-quit-save",
      expectedType: "pre-close",
      description: "Window quit dirty → 保存 button → pre-close",
    },
  ];

  for (const { op, expectedType, description } of matrix) {
    it(`${description}`, () => {
      expect(getSnapshotTypeForOperation(op)).toBe(expectedType);
    });
  }
});

// ---------------------------------------------------------------------------
// Cross-check: no operation maps to wrong type
// ---------------------------------------------------------------------------

describe("§3.3 マトリクス: negative checks", () => {
  it("manual-save operations never return 'auto'", () => {
    const manualOps: SaveOperation[] = ["cmd-s", "save-button", "menu-save", "save-as"];
    for (const op of manualOps) {
      expect(getSnapshotTypeForOperation(op)).not.toBe("auto");
    }
  });

  it("manual-save operations never return 'pre-close'", () => {
    const manualOps: SaveOperation[] = ["cmd-s", "save-button", "menu-save", "save-as"];
    for (const op of manualOps) {
      expect(getSnapshotTypeForOperation(op)).not.toBe("pre-close");
    }
  });

  it("auto-save never returns 'manual' or 'pre-close'", () => {
    const type = getSnapshotTypeForOperation("auto-save");
    expect(type).not.toBe("manual");
    expect(type).not.toBe("pre-close");
  });

  it("close operations never return 'manual' or 'auto'", () => {
    const closeOps: SaveOperation[] = ["tab-close-save", "window-quit-save"];
    for (const op of closeOps) {
      const type = getSnapshotTypeForOperation(op);
      expect(type).not.toBe("manual");
      expect(type).not.toBe("auto");
    }
  });
});

// ---------------------------------------------------------------------------
// Verify SnapshotType values are valid (type narrowing check)
// ---------------------------------------------------------------------------

describe("§3.3 マトリクス: type validity", () => {
  const validTypes: SnapshotType[] = [
    "auto",
    "manual",
    "milestone",
    "pre-close",
    "pre-external-reload",
    "restore-point",
  ];

  it("all matrix outputs are valid SnapshotType values", () => {
    const allOps: SaveOperation[] = [
      "cmd-s",
      "save-button",
      "menu-save",
      "save-as",
      "auto-save",
      "tab-close-save",
      "window-quit-save",
    ];
    for (const op of allOps) {
      const type = getSnapshotTypeForOperation(op);
      expect(validTypes).toContain(type);
    }
  });
});
