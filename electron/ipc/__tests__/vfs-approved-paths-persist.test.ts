/**
 * Tests for VFS approved-paths persistence (vfs-approvals.js)
 *
 * These tests exercise the pure persistence helpers that back the
 * `vfs:set-root` rehydration feature (issue #1476).
 *
 * Architecture note: vfs-ipc.js is a CommonJS Electron main-process module
 * that cannot be imported directly into vitest. We test the extracted pure
 * functions from electron/lib/vfs-approvals.js instead.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import fsSync from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** @type {{ loadAllApprovals, loadApprovals, saveApprovals, clearApprovalsCache }} */
const {
  loadAllApprovals,
  loadApprovals,
  saveApprovals,
  clearApprovalsCache,
} = require("../../../electron/lib/vfs-approvals.js");

// -----------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------

/** Create a fresh temporary file path for each test (not created yet). */
function tempFilePath() {
  return path.join(os.tmpdir(), `vfs-approvals-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

let tmpFile: string;

beforeEach(() => {
  tmpFile = tempFilePath();
  clearApprovalsCache();
});

afterEach(() => {
  // Clean up temp file if it was created
  try {
    fsSync.unlinkSync(tmpFile);
  } catch {
    // ignore if not created
  }
  clearApprovalsCache();
});

// -----------------------------------------------------------------------
// approve writes JSON
// -----------------------------------------------------------------------
describe("saveApprovals()", () => {
  it("creates the JSON file with correct schema on first write", async () => {
    const paths = new Set(["/Users/alice/novel1"]);
    await saveApprovals(tmpFile, "proj_001", paths);

    const raw = fsSync.readFileSync(tmpFile, "utf-8");
    const data = JSON.parse(raw);
    expect(data.version).toBe(1);
    expect(Array.isArray(data.approvals)).toBe(true);
    expect(data.approvals).toHaveLength(1);
    expect(data.approvals[0].projectId).toBe("proj_001");
    expect(data.approvals[0].path).toBe("/Users/alice/novel1");
    expect(typeof data.approvals[0].approvedAt).toBe("string");
  });

  it("replaces only the given projectId, keeping other projects intact", async () => {
    // Seed file with two projects
    const seed = {
      version: 1,
      approvals: [
        { projectId: "proj_A", path: "/Users/alice/projectA", approvedAt: "2026-01-01T00:00:00.000Z" },
        { projectId: "proj_B", path: "/Users/bob/projectB", approvedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    fsSync.writeFileSync(tmpFile, JSON.stringify(seed));
    clearApprovalsCache();

    // Update proj_A only
    await saveApprovals(tmpFile, "proj_A", new Set(["/Users/alice/novel2"]));

    const raw = fsSync.readFileSync(tmpFile, "utf-8");
    const data = JSON.parse(raw);
    const projBEntry = data.approvals.find((a: { projectId: string; path: string }) => a.projectId === "proj_B");
    const projAEntry = data.approvals.find((a: { projectId: string; path: string }) => a.projectId === "proj_A");

    // proj_B must remain untouched
    expect(projBEntry).toBeDefined();
    expect(projBEntry.path).toBe("/Users/bob/projectB");

    // proj_A must be updated
    expect(projAEntry).toBeDefined();
    expect(projAEntry.path).toBe("/Users/alice/novel2");
  });
});

// -----------------------------------------------------------------------
// restart-simulated reload restores only projectId-matching paths
// -----------------------------------------------------------------------
describe("loadApprovals()", () => {
  it("returns only paths belonging to the requested projectId", async () => {
    const data = {
      version: 1,
      approvals: [
        { projectId: "proj_X", path: "/Users/alice/xProject", approvedAt: "2026-01-01T00:00:00.000Z" },
        { projectId: "proj_Y", path: "/Users/alice/yProject", approvedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    fsSync.writeFileSync(tmpFile, JSON.stringify(data));
    clearApprovalsCache();

    const result = await loadApprovals(tmpFile, "proj_X");
    expect(result.has("/Users/alice/xProject")).toBe(true);
    expect(result.has("/Users/alice/yProject")).toBe(false);
  });

  it("returns empty Set when projectId has no entries", async () => {
    const data = { version: 1, approvals: [] };
    fsSync.writeFileSync(tmpFile, JSON.stringify(data));
    clearApprovalsCache();

    const result = await loadApprovals(tmpFile, "proj_UNKNOWN");
    expect(result.size).toBe(0);
  });

  it("simulates restart: cache cleared → reads from disk", async () => {
    await saveApprovals(tmpFile, "proj_restart", new Set(["/Users/carol/myProject"]));
    // Simulate restart: clear in-memory cache
    clearApprovalsCache();

    const restored = await loadApprovals(tmpFile, "proj_restart");
    expect(restored.has("/Users/carol/myProject")).toBe(true);
  });
});

// -----------------------------------------------------------------------
// corrupt JSON → empty Set fallback
// -----------------------------------------------------------------------
describe("corrupt JSON fallback", () => {
  it("returns empty Set when file is not valid JSON", async () => {
    fsSync.writeFileSync(tmpFile, "{ this is not json }", "utf-8");
    clearApprovalsCache();

    const result = await loadApprovals(tmpFile, "proj_any");
    expect(result.size).toBe(0);
  });

  it("returns empty Set when version field is wrong", async () => {
    const data = { version: 999, approvals: [{ projectId: "proj_x", path: "/foo" }] };
    fsSync.writeFileSync(tmpFile, JSON.stringify(data));
    clearApprovalsCache();

    const result = await loadApprovals(tmpFile, "proj_x");
    expect(result.size).toBe(0);
  });

  it("returns empty Set when file does not exist", async () => {
    const nonExistentFile = path.join(os.tmpdir(), "does-not-exist-vfs-approvals.json");
    clearApprovalsCache();

    const result = await loadApprovals(nonExistentFile, "proj_x");
    expect(result.size).toBe(0);
  });

  it("skips malformed entries (missing path or projectId)", async () => {
    const data = {
      version: 1,
      approvals: [
        null,
        { projectId: "proj_ok", path: "/good/path", approvedAt: "2026-01-01T00:00:00.000Z" },
        { projectId: "proj_ok" }, // missing path
        { path: "/no/projectId" }, // missing projectId
      ],
    };
    fsSync.writeFileSync(tmpFile, JSON.stringify(data));
    clearApprovalsCache();

    const result = await loadApprovals(tmpFile, "proj_ok");
    expect(result.has("/good/path")).toBe(true);
    expect(result.size).toBe(1);
  });
});

// -----------------------------------------------------------------------
// denied path NOT persisted (security regression)
// -----------------------------------------------------------------------
describe("security: denied paths are never auto-persisted", () => {
  it("only saves paths that are explicitly added to the Set", async () => {
    // saveApprovals only saves the Set that is passed to it.
    // A denied path should never appear in the Set — caller responsibility.
    const approvedSet = new Set(["/Users/alice/allowedProject"]);
    // Denied path is simply never added to the set
    await saveApprovals(tmpFile, "proj_sec", approvedSet);

    clearApprovalsCache();
    const restored = await loadApprovals(tmpFile, "proj_sec");
    expect(restored.has("/Users/alice/allowedProject")).toBe(true);
    expect(restored.has("/etc/passwd")).toBe(false);
    expect(restored.size).toBe(1);
  });

  it("empty Set means no paths are persisted for the project", async () => {
    await saveApprovals(tmpFile, "proj_empty", new Set());
    clearApprovalsCache();
    const restored = await loadApprovals(tmpFile, "proj_empty");
    expect(restored.size).toBe(0);
  });
});

// -----------------------------------------------------------------------
// different projectId → independent approval set (R6 scoping)
// -----------------------------------------------------------------------
describe("R6 scoping: different projectId gets isolated approval set", () => {
  it("paths from project A are not visible when querying project B", async () => {
    await saveApprovals(tmpFile, "proj_alpha", new Set(["/Users/alice/alpha"]));
    clearApprovalsCache();
    await saveApprovals(tmpFile, "proj_beta", new Set(["/Users/bob/beta"]));

    clearApprovalsCache();
    const alphaApprovals = await loadApprovals(tmpFile, "proj_alpha");
    const betaApprovals = await loadApprovals(tmpFile, "proj_beta");

    expect(alphaApprovals.has("/Users/alice/alpha")).toBe(true);
    expect(alphaApprovals.has("/Users/bob/beta")).toBe(false);

    expect(betaApprovals.has("/Users/bob/beta")).toBe(true);
    expect(betaApprovals.has("/Users/alice/alpha")).toBe(false);
  });

  it("switching projects clears only the target project's approvals, not others", async () => {
    // Set up two projects
    await saveApprovals(tmpFile, "proj_alpha", new Set(["/alpha/path"]));
    clearApprovalsCache();
    await saveApprovals(tmpFile, "proj_beta", new Set(["/beta/path"]));

    // Reset proj_alpha (simulate switching away)
    clearApprovalsCache();
    await saveApprovals(tmpFile, "proj_alpha", new Set());

    clearApprovalsCache();
    const alphaApprovals = await loadApprovals(tmpFile, "proj_alpha");
    const betaApprovals = await loadApprovals(tmpFile, "proj_beta");

    expect(alphaApprovals.size).toBe(0);
    expect(betaApprovals.has("/beta/path")).toBe(true);
  });
});

// -----------------------------------------------------------------------
// in-memory cache: avoids disk reads on repeated calls
// -----------------------------------------------------------------------
describe("in-memory cache (NEW-3)", () => {
  it("returns cached result without re-reading disk after first load", async () => {
    const data = { version: 1, approvals: [{ projectId: "proj_c", path: "/c/path", approvedAt: "2026-01-01T00:00:00.000Z" }] };
    fsSync.writeFileSync(tmpFile, JSON.stringify(data));
    clearApprovalsCache();

    // First load populates cache
    await loadApprovals(tmpFile, "proj_c");

    // Overwrite file on disk with different content
    const updated = { version: 1, approvals: [{ projectId: "proj_c", path: "/different/path", approvedAt: "2026-01-02T00:00:00.000Z" }] };
    fsSync.writeFileSync(tmpFile, JSON.stringify(updated));

    // Should still return cached (original) result
    const result = await loadApprovals(tmpFile, "proj_c");
    expect(result.has("/c/path")).toBe(true);
    expect(result.has("/different/path")).toBe(false);
  });

  it("saveApprovals() invalidates cache so next loadApprovals reads fresh data", async () => {
    await saveApprovals(tmpFile, "proj_d", new Set(["/d/original"]));
    // Cache is populated after save. Now save again with different paths:
    await saveApprovals(tmpFile, "proj_d", new Set(["/d/updated"]));

    // After second save cache is invalidated and repopulated with fresh data
    const result = await loadApprovals(tmpFile, "proj_d");
    expect(result.has("/d/updated")).toBe(true);
    expect(result.has("/d/original")).toBe(false);
  });
});
