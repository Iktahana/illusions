/** Tab identifiers for the Explorer sidebar */
export type Tab = "chapters" | "settings" | "style";

/** Props for the main Explorer component */
export interface ExplorerProps {
  className?: string;
  content?: string;
  onChapterClick?: (anchorId: string) => void;
  onInsertText?: (text: string) => void;
  compactMode?: boolean;
  // Style settings
  fontScale?: number;
  onFontScaleChange?: (scale: number) => void;
  lineHeight?: number;
  onLineHeightChange?: (height: number) => void;
  paragraphSpacing?: number;
  onParagraphSpacingChange?: (spacing: number) => void;
  textIndent?: number;
  onTextIndentChange?: (indent: number) => void;
  fontFamily?: string;
  onFontFamilyChange?: (family: string) => void;
  charsPerLine?: number;
  onCharsPerLineChange?: (chars: number) => void;
  autoCharsPerLine?: boolean;
  onAutoCharsPerLineChange?: (value: boolean) => void;
  showParagraphNumbers?: boolean;
  onShowParagraphNumbersChange?: (show: boolean) => void;
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
