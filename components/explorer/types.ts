/** Tab identifiers for the Explorer sidebar */
export type Tab = "chapters" | "settings" | "style";

/** Props for the main Explorer component */
export interface ExplorerProps {
  className?: string;
  content?: string;
  onChapterClick?: (anchorId: string) => void;
  onInsertText?: (text: string) => void;
  compactMode?: boolean;
}

/** Represents a file or directory in the virtual file tree */
export interface FileTreeEntry {
  name: string;
  kind: "file" | "directory";
  children?: FileTreeEntry[];
}

/** State for inline editing (rename / new file / new folder) */
export interface EditingEntry {
  /** Parent directory path (e.g. "/" or "/subdir") */
  parentPath: string;
  /** What kind of editing operation */
  kind: "rename" | "new-file" | "new-folder";
  /** Current file/folder name (used for rename; empty for new) */
  currentName: string;
}
