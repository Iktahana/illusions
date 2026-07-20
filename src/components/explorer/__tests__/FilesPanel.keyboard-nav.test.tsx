import { describe, it, expect } from "vitest";
import {
  flattenVisibleRows,
  nextRowPath,
  prevRowPath,
  firstRowPath,
  lastRowPath,
  arrowRight,
  arrowLeft,
  parentTreePath,
  joinTreePath,
  indexOfRow,
} from "../tree-navigation";
import type { FileTreeEntry } from "../types";

/**
 * Pure-logic tests for FilesPanel keyboard navigation (#1854).
 * These exercise the flatten + roving-tabindex navigation computation without a
 * DOM render library, so no new devDependency is required.
 */

// A small tree:
//   /                       (root)
//   ├── docs/               (expanded)
//   │   ├── deep/           (collapsed) -> children hidden
//   │   │   └── inner.txt   (hidden)
//   │   └── a.txt
//   └── b.txt
const tree: FileTreeEntry[] = [
  {
    name: "docs",
    kind: "directory",
    children: [
      {
        name: "deep",
        kind: "directory",
        children: [{ name: "inner.txt", kind: "file" }],
      },
      { name: "a.txt", kind: "file" },
    ],
  },
  { name: "b.txt", kind: "file" },
];

const expandedAll = new Set<string>(["/", "/docs", "/docs/deep"]);
const expandedDeepCollapsed = new Set<string>(["/", "/docs"]);

describe("path helpers", () => {
  it("joinTreePath handles root vs nested", () => {
    expect(joinTreePath("/", "x.txt")).toBe("/x.txt");
    expect(joinTreePath("/docs", "x.txt")).toBe("/docs/x.txt");
  });

  it("parentTreePath ascends and stops at root", () => {
    expect(parentTreePath("/")).toBeNull();
    expect(parentTreePath("/b.txt")).toBe("/");
    expect(parentTreePath("/docs/a.txt")).toBe("/docs");
    expect(parentTreePath("/docs/deep/inner.txt")).toBe("/docs/deep");
  });
});

describe("flattenVisibleRows", () => {
  it("returns empty list for null tree", () => {
    expect(flattenVisibleRows(null, new Set(["/"]))).toEqual([]);
  });

  it("collapsed root shows only the root row", () => {
    const rows = flattenVisibleRows(tree, new Set());
    expect(rows.map((r) => r.path)).toEqual(["/"]);
    expect(rows[0].expanded).toBe(false);
  });

  it("hides descendants of collapsed folders", () => {
    const rows = flattenVisibleRows(tree, expandedDeepCollapsed);
    expect(rows.map((r) => r.path)).toEqual(["/", "/docs", "/docs/deep", "/docs/a.txt", "/b.txt"]);
    // inner.txt is hidden because /docs/deep is collapsed
    expect(rows.find((r) => r.path === "/docs/deep")?.expanded).toBe(false);
  });

  it("shows full depth when everything is expanded with correct aria levels", () => {
    const rows = flattenVisibleRows(tree, expandedAll);
    expect(rows.map((r) => r.path)).toEqual([
      "/",
      "/docs",
      "/docs/deep",
      "/docs/deep/inner.txt",
      "/docs/a.txt",
      "/b.txt",
    ]);
    expect(rows.find((r) => r.path === "/")?.level).toBe(1);
    expect(rows.find((r) => r.path === "/docs")?.level).toBe(2);
    expect(rows.find((r) => r.path === "/docs/deep")?.level).toBe(3);
    expect(rows.find((r) => r.path === "/docs/deep/inner.txt")?.level).toBe(4);
  });

  it("empty project (empty tree array) yields just the root row", () => {
    const rows = flattenVisibleRows([], new Set(["/"]));
    expect(rows.map((r) => r.path)).toEqual(["/"]);
  });
});

describe("ArrowDown / ArrowUp (stop at ends, no wrap)", () => {
  const rows = flattenVisibleRows(tree, expandedAll);

  it("ArrowDown moves to the next visible row", () => {
    expect(nextRowPath(rows, "/")).toBe("/docs");
    expect(nextRowPath(rows, "/docs")).toBe("/docs/deep");
    expect(nextRowPath(rows, "/docs/deep")).toBe("/docs/deep/inner.txt");
  });

  it("ArrowDown stops at the last row (returns null)", () => {
    expect(nextRowPath(rows, "/b.txt")).toBeNull();
  });

  it("ArrowUp moves to the previous visible row", () => {
    expect(prevRowPath(rows, "/b.txt")).toBe("/docs/a.txt");
    expect(prevRowPath(rows, "/docs")).toBe("/");
  });

  it("ArrowUp stops at the first row (returns null)", () => {
    expect(prevRowPath(rows, "/")).toBeNull();
  });

  it("defaults to first row when current path is unknown/null", () => {
    expect(nextRowPath(rows, null)).toBe("/");
    expect(prevRowPath(rows, "/nonexistent")).toBe("/");
  });

  it("single-row tree: ArrowDown/Up have no movement", () => {
    const single = flattenVisibleRows(tree, new Set()); // only "/"
    expect(single).toHaveLength(1);
    expect(nextRowPath(single, "/")).toBeNull();
    expect(prevRowPath(single, "/")).toBeNull();
  });

  it("empty tree: navigation returns null", () => {
    expect(nextRowPath([], "/")).toBeNull();
    expect(prevRowPath([], null)).toBeNull();
  });
});

describe("Home / End", () => {
  const rows = flattenVisibleRows(tree, expandedAll);

  it("Home -> first, End -> last", () => {
    expect(firstRowPath(rows)).toBe("/");
    expect(lastRowPath(rows)).toBe("/b.txt");
  });

  it("empty tree -> null", () => {
    expect(firstRowPath([])).toBeNull();
    expect(lastRowPath([])).toBeNull();
  });
});

describe("ArrowRight (expand / descend)", () => {
  it("collapsed folder expands", () => {
    const rows = flattenVisibleRows(tree, new Set(["/"]));
    // root is expanded; /docs is collapsed in this set
    expect(arrowRight(rows, "/docs")).toEqual({ expand: "/docs" });
  });

  it("expanded folder focuses first child", () => {
    const rows = flattenVisibleRows(tree, expandedAll);
    expect(arrowRight(rows, "/docs")).toEqual({ focus: "/docs/deep" });
    expect(arrowRight(rows, "/")).toEqual({ focus: "/docs" });
  });

  it("expanded but empty folder is a no-op", () => {
    const emptyDir: FileTreeEntry[] = [{ name: "empty", kind: "directory", children: [] }];
    const rows = flattenVisibleRows(emptyDir, new Set(["/", "/empty"]));
    expect(arrowRight(rows, "/empty")).toEqual({});
  });

  it("file is a no-op", () => {
    const rows = flattenVisibleRows(tree, expandedAll);
    expect(arrowRight(rows, "/b.txt")).toEqual({});
  });

  it("unknown path is a no-op", () => {
    const rows = flattenVisibleRows(tree, expandedAll);
    expect(arrowRight(rows, "/nope")).toEqual({});
  });
});

describe("ArrowLeft (collapse / ascend to parent)", () => {
  it("expanded folder collapses", () => {
    const rows = flattenVisibleRows(tree, expandedAll);
    expect(arrowLeft(rows, "/docs")).toEqual({ collapse: "/docs" });
    expect(arrowLeft(rows, "/")).toEqual({ collapse: "/" });
  });

  it("collapsed folder ascends to parent", () => {
    const rows = flattenVisibleRows(tree, expandedDeepCollapsed);
    expect(arrowLeft(rows, "/docs/deep")).toEqual({ focus: "/docs" });
  });

  it("file ascends to parent", () => {
    const rows = flattenVisibleRows(tree, expandedAll);
    expect(arrowLeft(rows, "/docs/a.txt")).toEqual({ focus: "/docs" });
    expect(arrowLeft(rows, "/b.txt")).toEqual({ focus: "/" });
  });

  it("top-level item with no visible parent (root collapsed scenario) is bounded", () => {
    // When focused on root itself and collapsed, no parent exists -> no-op.
    const rows = flattenVisibleRows(tree, new Set());
    expect(arrowLeft(rows, "/")).toEqual({});
  });

  it("unknown path is a no-op", () => {
    const rows = flattenVisibleRows(tree, expandedAll);
    expect(arrowLeft(rows, "/nope")).toEqual({});
  });
});

describe("roving tabindex selection (indexOfRow)", () => {
  const rows = flattenVisibleRows(tree, expandedAll);

  it("locates the active row for tabIndex=0 assignment", () => {
    expect(indexOfRow(rows, "/docs/a.txt")).toBe(4);
  });

  it("returns -1 for paths not currently visible", () => {
    expect(indexOfRow(rows, "/docs/deep/inner.txt")).toBe(3);
    expect(
      indexOfRow(flattenVisibleRows(tree, expandedDeepCollapsed), "/docs/deep/inner.txt"),
    ).toBe(-1);
  });

  it("returns -1 for null", () => {
    expect(indexOfRow(rows, null)).toBe(-1);
  });
});
