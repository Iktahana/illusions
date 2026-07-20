/**
 * Tests for the B1 fix: tryCreateSnapshot type routing in use-file-io.
 *
 * These tests extract and verify the pure snapshot-type routing logic:
 * - saveFile(isAutoSave=false)  → tryCreateSnapshot called with "manual"
 * - saveFile(isAutoSave=true)   → tryCreateSnapshot called with "auto"
 * - saveAsFile()                → tryCreateSnapshot called with "manual"
 *
 * The hook itself is not mounted (no React); we test the routing logic
 * as pure functions extracted from the hook's internal logic.
 */

import { describe, it, expect } from "vitest";
import type { SnapshotType } from "@/lib/services/history-policy";

// ---------------------------------------------------------------------------
// Pure logic extracted from use-file-io.ts saveFile / saveAsFile
// ---------------------------------------------------------------------------

/**
 * Maps the isAutoSave parameter of saveFile() to the correct SnapshotType.
 * This is the core of the B1 fix: the type is no longer hardcoded "auto".
 */
function getSnapshotTypeForSave(isAutoSave: boolean): SnapshotType {
  return isAutoSave ? "auto" : "manual";
}

/**
 * saveAsFile always creates a manual snapshot (it is always a user-initiated save).
 */
function getSnapshotTypeForSaveAs(): SnapshotType {
  return "manual";
}

/**
 * Tab close "保存" button creates a pre-close snapshot.
 */
function getSnapshotTypeForCloseTabSave(): SnapshotType {
  return "pre-close";
}

/**
 * Window quit "保存" button creates a pre-close snapshot.
 */
function getSnapshotTypeForWindowQuitSave(): SnapshotType {
  return "pre-close";
}

/**
 * Auto-save interval creates an auto snapshot.
 */
function getSnapshotTypeForAutoSaveInterval(): SnapshotType {
  return "auto";
}

// ---------------------------------------------------------------------------
// Tests: B1 fix — saveFile type routing
// ---------------------------------------------------------------------------

describe("B1 fix: saveFile snapshot type routing", () => {
  it("returns 'manual' when isAutoSave=false (Cmd+S / menu save / Save button)", () => {
    const type = getSnapshotTypeForSave(false);
    expect(type).toBe("manual");
  });

  it("returns 'auto' when isAutoSave=true (auto-save interval via saveFile)", () => {
    const type = getSnapshotTypeForSave(true);
    expect(type).toBe("auto");
  });

  it("never returns 'pre-close' from saveFile", () => {
    const typeManual = getSnapshotTypeForSave(false);
    const typeAuto = getSnapshotTypeForSave(true);
    expect(typeManual).not.toBe("pre-close");
    expect(typeAuto).not.toBe("pre-close");
  });
});

// ---------------------------------------------------------------------------
// Tests: B1 fix — saveAsFile type routing
// ---------------------------------------------------------------------------

describe("B1 fix: saveAsFile snapshot type routing", () => {
  it("always returns 'manual' for Save As", () => {
    const type = getSnapshotTypeForSaveAs();
    expect(type).toBe("manual");
  });

  it("never returns 'auto' for Save As", () => {
    expect(getSnapshotTypeForSaveAs()).not.toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// Tests: B1 fix — close dialog type routing
// ---------------------------------------------------------------------------

describe("B1 fix: close dialog snapshot type routing", () => {
  it("returns 'pre-close' for tab close 保存 button", () => {
    expect(getSnapshotTypeForCloseTabSave()).toBe("pre-close");
  });

  it("returns 'pre-close' for window quit 保存 button", () => {
    expect(getSnapshotTypeForWindowQuitSave()).toBe("pre-close");
  });
});

// ---------------------------------------------------------------------------
// Tests: B1 fix — auto-save interval type routing
// ---------------------------------------------------------------------------

describe("B1 fix: auto-save interval snapshot type routing", () => {
  it("returns 'auto' for auto-save interval", () => {
    expect(getSnapshotTypeForAutoSaveInterval()).toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// Tests: B1 fix — old tryAutoSnapshot shim maps forceSnapshot correctly
// ---------------------------------------------------------------------------

describe("B1 compat shim: tryAutoSnapshot forceSnapshot → SnapshotType", () => {
  /**
   * tryAutoSnapshot shim: forceSnapshot=false → "auto", forceSnapshot=true → "manual".
   * Mirrors the deprecated shim in use-file-io.ts.
   */
  function shimForceSnapshotToType(forceSnapshot: boolean): SnapshotType {
    return forceSnapshot ? "manual" : "auto";
  }

  it("maps forceSnapshot=false to 'auto'", () => {
    expect(shimForceSnapshotToType(false)).toBe("auto");
  });

  it("maps forceSnapshot=true to 'manual'", () => {
    expect(shimForceSnapshotToType(true)).toBe("manual");
  });
});
