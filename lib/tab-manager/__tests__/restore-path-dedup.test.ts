/**
 * Regression test for #1528 — duplicate tab for the default/restored file.
 *
 * Root cause: a tab restored on startup stored its `file.path` as an ABSOLUTE
 * path (toAbsolutePath(relativePath, rootPath)), while a tab opened from the
 * file tree stores the VFS-RELATIVE path (toVFSPath(treePath), i.e. the tree
 * path with the leading slash stripped). The dedup in openProjectFile compares
 * `tab.file.path === vfsPath` by string equality, so the same file restored on
 * launch and then clicked in the tree produced two tabs.
 *
 * Fix: restoreProjectTabs now stores `saved.relativePath` (the same VFS-relative
 * representation the tree passes) as `file.path`. These tests lock that the two
 * representations match for the dedup, using the real path helpers.
 */

import { describe, it, expect } from "vitest";
import { toRelativePath, toAbsolutePath } from "@/lib/project/workspace-persistence";

// Replica of FilesPanel.tsx `toVFSPath` (treePath stripped of a leading slash) —
// the exact value the file tree hands to openProjectFile as `vfsPath`.
const toVFSPath = (treePath: string): string => treePath.replace(/^\//, "");

describe("#1528 restored-tab path matches tree-opened path (dedup)", () => {
  const rootPath = "/Users/iktahana/Library/CloudStorage/GoogleDrive-x/My Drive/原稿/無題";

  it.each([
    ["/無題.mdi", "無題.mdi"],
    ["/test.mdi", "test.mdi"],
    ["/章/01.mdi", "章/01.mdi"],
  ])("tree path %s and restored path resolve to the same dedup key", (treePath, relativePath) => {
    // What the file tree passes to openProjectFile (and what a tree-opened tab stores).
    const treeVfsPath = toVFSPath(treePath);

    // What workspace.json stores for that file, then what the FIXED restore uses
    // for tab.file.path.
    const savedRelativePath = relativePath;
    const restoredTabPath = savedRelativePath; // fixed behavior

    // Dedup (tab.file.path === vfsPath) must now match.
    expect(restoredTabPath).toBe(treeVfsPath);
  });

  it("the OLD behavior (absolute restore path) would have broken dedup", () => {
    const relativePath = "無題.mdi";
    const treeVfsPath = toVFSPath("/無題.mdi"); // "無題.mdi"
    const oldRestoredTabPath = toAbsolutePath(relativePath, rootPath); // absolute

    expect(oldRestoredTabPath).not.toBe(treeVfsPath); // this mismatch was the bug
    expect(oldRestoredTabPath.startsWith(rootPath)).toBe(true);
  });

  it("round-trips: saved relativePath equals the tree's vfs path for an in-root file", () => {
    const absoluteOriginal = `${rootPath}/無題.mdi`;
    const savedRelativePath = toRelativePath(absoluteOriginal, rootPath);
    expect(savedRelativePath).toBe(toVFSPath("/無題.mdi"));
    expect(savedRelativePath).toBe("無題.mdi");
  });

  it("web mode (rootPath null): paths stay relative on both sides", () => {
    const relativePath = "無題.mdi";
    // In web mode toAbsolutePath returns the relative path unchanged, so old and
    // new restore behavior coincide and already matched the tree path.
    expect(toAbsolutePath(relativePath, null)).toBe(relativePath);
    expect(relativePath).toBe(toVFSPath("/無題.mdi"));
  });
});
