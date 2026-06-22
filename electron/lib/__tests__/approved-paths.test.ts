/**
 * Tests for the shared per-window approved-path LRU registry (#1435).
 *
 * This registry backs the dialog-approval tracking in BOTH
 * electron/ipc/file-ipc.js and electron/ipc/vfs-ipc.js, so its invariants
 * are security-relevant:
 * - approvals must be isolated per window (no cross-window reuse)
 * - per-window sets must be bounded (LRU eviction at capacity)
 * - unknown windows / unapproved paths must fail closed (has() === false)
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createApprovedPathRegistry, isWithinApprovedTree, DEFAULT_MAX_APPROVED_PATHS } =
  require("../../../electron/lib/approved-paths") as {
    createApprovedPathRegistry: (maxEntries?: number) => {
      approve: (webContentsId: number, p: string) => void;
      has: (webContentsId: number | undefined, p: string) => boolean;
      listWindowPaths: (webContentsId: number) => string[];
      revokeWindow: (webContentsId: number) => void;
    };
    isWithinApprovedTree: (approvedPaths: readonly string[], normalizedPath: string) => boolean;
    DEFAULT_MAX_APPROVED_PATHS: number;
  };

describe("createApprovedPathRegistry()", () => {
  it("exposes the historical default capacity of 200", () => {
    expect(DEFAULT_MAX_APPROVED_PATHS).toBe(200);
  });

  it("returns false for a path that was never approved (fail closed)", () => {
    const registry = createApprovedPathRegistry();
    expect(registry.has(1, "/home/user/doc.mdi")).toBe(false);
  });

  it("returns false for an unknown window id, including undefined", () => {
    const registry = createApprovedPathRegistry();
    registry.approve(1, "/home/user/doc.mdi");
    expect(registry.has(99, "/home/user/doc.mdi")).toBe(false);
    expect(registry.has(undefined, "/home/user/doc.mdi")).toBe(false);
  });

  it("approves a path for the requesting window only (per-window scoping)", () => {
    const registry = createApprovedPathRegistry();
    registry.approve(1, "/home/user/a.mdi");
    expect(registry.has(1, "/home/user/a.mdi")).toBe(true);
    // Cross-window reuse must be denied
    expect(registry.has(2, "/home/user/a.mdi")).toBe(false);
  });

  it("evicts the oldest entry when the per-window capacity is exceeded", () => {
    const registry = createApprovedPathRegistry(3);
    registry.approve(1, "/p/1");
    registry.approve(1, "/p/2");
    registry.approve(1, "/p/3");
    registry.approve(1, "/p/4"); // evicts /p/1
    expect(registry.has(1, "/p/1")).toBe(false);
    expect(registry.has(1, "/p/2")).toBe(true);
    expect(registry.has(1, "/p/3")).toBe(true);
    expect(registry.has(1, "/p/4")).toBe(true);
  });

  it("re-approving a path refreshes its LRU position", () => {
    const registry = createApprovedPathRegistry(3);
    registry.approve(1, "/p/1");
    registry.approve(1, "/p/2");
    registry.approve(1, "/p/3");
    registry.approve(1, "/p/1"); // refresh: /p/2 is now oldest
    registry.approve(1, "/p/4"); // evicts /p/2
    expect(registry.has(1, "/p/1")).toBe(true);
    expect(registry.has(1, "/p/2")).toBe(false);
  });

  it("eviction in one window does not affect another window", () => {
    const registry = createApprovedPathRegistry(2);
    registry.approve(1, "/p/1");
    registry.approve(2, "/p/1");
    registry.approve(1, "/p/2");
    registry.approve(1, "/p/3"); // evicts /p/1 in window 1 only
    expect(registry.has(1, "/p/1")).toBe(false);
    expect(registry.has(2, "/p/1")).toBe(true);
  });

  it("listWindowPaths returns approved paths oldest → newest", () => {
    const registry = createApprovedPathRegistry();
    registry.approve(1, "/p/a");
    registry.approve(1, "/p/b");
    registry.approve(1, "/p/a"); // refresh to most-recent
    expect(registry.listWindowPaths(1)).toEqual(["/p/b", "/p/a"]);
  });

  it("listWindowPaths returns an empty array for an unknown window", () => {
    const registry = createApprovedPathRegistry();
    expect(registry.listWindowPaths(42)).toEqual([]);
  });

  it("revokeWindow removes all approvals for that window only", () => {
    const registry = createApprovedPathRegistry();
    registry.approve(1, "/p/a");
    registry.approve(2, "/p/b");
    registry.revokeWindow(1);
    expect(registry.has(1, "/p/a")).toBe(false);
    expect(registry.listWindowPaths(1)).toEqual([]);
    expect(registry.has(2, "/p/b")).toBe(true);
  });

  it("re-approval after revokeWindow works (window id reuse)", () => {
    const registry = createApprovedPathRegistry();
    registry.approve(1, "/p/a");
    registry.revokeWindow(1);
    registry.approve(1, "/p/c");
    expect(registry.has(1, "/p/a")).toBe(false);
    expect(registry.has(1, "/p/c")).toBe(true);
  });
});

describe("isWithinApprovedTree()", () => {
  it("returns true for the exact approved path", () => {
    expect(isWithinApprovedTree(["/Users/foo/Documents"], "/Users/foo/Documents")).toBe(true);
  });

  it("returns true for a child of an approved tree (new-project flow)", () => {
    // openDirectory() approves the parent; createProject promotes the new child.
    expect(isWithinApprovedTree(["/Users/foo/Documents"], "/Users/foo/Documents/缶詰")).toBe(true);
  });

  it("returns true for a deeply nested descendant", () => {
    expect(isWithinApprovedTree(["/Users/foo/Documents"], "/Users/foo/Documents/a/b/c")).toBe(true);
  });

  it("returns false for a sibling that merely shares a name prefix", () => {
    // Must not treat "/Users/foo/Documents-evil" as inside "/Users/foo/Documents".
    expect(isWithinApprovedTree(["/Users/foo/Documents"], "/Users/foo/Documents-evil")).toBe(false);
  });

  it("returns false for a parent of an approved path (no upward escape)", () => {
    expect(isWithinApprovedTree(["/Users/foo/Documents"], "/Users/foo")).toBe(false);
  });

  it("returns false when there are no approved paths", () => {
    expect(isWithinApprovedTree([], "/Users/foo/Documents")).toBe(false);
  });

  it("matches against any of multiple approved trees", () => {
    const trees = ["/a/b", "/Users/foo/Documents"];
    expect(isWithinApprovedTree(trees, "/Users/foo/Documents/proj")).toBe(true);
    expect(isWithinApprovedTree(trees, "/c/d/proj")).toBe(false);
  });
});
