import type { FileTreeEntry } from "./types";

/**
 * A single keyboard-navigable row in the flattened file tree.
 * Pure data structure — no DOM, no React — so navigation logic is unit-testable.
 */
export interface VisibleRow {
  /** Full tree path, e.g. "/" (root) or "/sub/file.txt" */
  path: string;
  kind: "file" | "directory";
  /** Nesting depth: root = 1, its children = 2, ... (matches aria-level) */
  level: number;
  /** For directories only: whether the folder is currently expanded */
  expanded?: boolean;
}

/** Build the full tree path for a child entry under the given parent path. */
export function joinTreePath(parentPath: string, name: string): string {
  return parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
}

/** Return the parent path of a tree path. Root ("/") has no parent (returns null). */
export function parentTreePath(path: string): string | null {
  if (path === "/") return null;
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return path.substring(0, lastSlash);
}

/**
 * Flatten the visible portion of the tree into an ordered list of rows,
 * mirroring the DOM rendering order (root header first, then expanded children
 * depth-first). Collapsed folders contribute their own row but not descendants.
 *
 * @param tree         Root-level entries (null when no project is open)
 * @param expandedDirs Set of expanded directory tree paths (includes "/")
 * @param projectName  Used only for the conceptual root; path is always "/"
 */
export function flattenVisibleRows(
  tree: FileTreeEntry[] | null,
  expandedDirs: Set<string>,
): VisibleRow[] {
  if (tree === null) return [];

  const rows: VisibleRow[] = [];
  const rootExpanded = expandedDirs.has("/");
  rows.push({ path: "/", kind: "directory", level: 1, expanded: rootExpanded });

  if (!rootExpanded) return rows;

  const walk = (entries: FileTreeEntry[], parentPath: string, level: number): void => {
    for (const entry of entries) {
      const fullPath = joinTreePath(parentPath, entry.name);
      if (entry.kind === "directory") {
        const expanded = expandedDirs.has(fullPath);
        rows.push({ path: fullPath, kind: "directory", level, expanded });
        if (expanded && entry.children) {
          walk(entry.children, fullPath, level + 1);
        }
      } else {
        rows.push({ path: fullPath, kind: "file", level });
      }
    }
  };

  walk(tree, "/", 2);
  return rows;
}

/** Index of the row matching the given path, or -1 if not present/visible. */
export function indexOfRow(rows: VisibleRow[], path: string | null): number {
  if (path === null) return -1;
  return rows.findIndex((r) => r.path === path);
}

/**
 * Compute the path to move focus to for ArrowDown.
 * Stops (does not wrap) at the last row. Returns null when no movement is possible.
 */
export function nextRowPath(rows: VisibleRow[], currentPath: string | null): string | null {
  if (rows.length === 0) return null;
  const idx = indexOfRow(rows, currentPath);
  if (idx === -1) return rows[0].path;
  if (idx >= rows.length - 1) return null;
  return rows[idx + 1].path;
}

/**
 * Compute the path to move focus to for ArrowUp.
 * Stops (does not wrap) at the first row. Returns null when no movement is possible.
 */
export function prevRowPath(rows: VisibleRow[], currentPath: string | null): string | null {
  if (rows.length === 0) return null;
  const idx = indexOfRow(rows, currentPath);
  if (idx === -1) return rows[0].path;
  if (idx <= 0) return null;
  return rows[idx - 1].path;
}

/** First visible row path (Home), or null when the tree is empty. */
export function firstRowPath(rows: VisibleRow[]): string | null {
  return rows.length > 0 ? rows[0].path : null;
}

/** Last visible row path (End), or null when the tree is empty. */
export function lastRowPath(rows: VisibleRow[]): string | null {
  return rows.length > 0 ? rows[rows.length - 1].path : null;
}

/** Result of an ArrowRight/ArrowLeft navigation computation. */
export interface HorizontalNavResult {
  /** A directory path that should be expanded, if any. */
  expand?: string;
  /** A directory path that should be collapsed, if any. */
  collapse?: string;
  /** A path that focus should move to, if any. */
  focus?: string;
}

/**
 * ArrowRight behavior (WAI-ARIA tree):
 *  - On a collapsed folder: expand it.
 *  - On an expanded folder: move focus to its first child (if any).
 *  - On a file: no-op.
 */
export function arrowRight(rows: VisibleRow[], currentPath: string | null): HorizontalNavResult {
  const idx = indexOfRow(rows, currentPath);
  if (idx === -1) return {};
  const row = rows[idx];
  if (row.kind !== "directory") return {};
  if (!row.expanded) return { expand: row.path };
  // Expanded: focus first child if the next row is deeper.
  const child = rows[idx + 1];
  if (child && child.level > row.level) return { focus: child.path };
  return {};
}

/**
 * ArrowLeft behavior (WAI-ARIA tree):
 *  - On an expanded folder: collapse it.
 *  - On a collapsed folder or file: move focus to its parent row (if visible).
 */
export function arrowLeft(rows: VisibleRow[], currentPath: string | null): HorizontalNavResult {
  const idx = indexOfRow(rows, currentPath);
  if (idx === -1) return {};
  const row = rows[idx];
  if (row.kind === "directory" && row.expanded) return { collapse: row.path };
  const parent = parentTreePath(row.path);
  if (parent !== null && indexOfRow(rows, parent) !== -1) return { focus: parent };
  return {};
}
