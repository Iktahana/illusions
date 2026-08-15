import type { DocumentCapabilities, DocumentFormat } from "@/lib/document-format";
import type { SearchMatch, SearchOptions } from "@/lib/editor-page/find-search-matches";

export type EditorCommandId =
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.paste"
  | "edit.selectAll"
  | "format.tcy"
  | "format.strong"
  | "format.emphasis"
  | "format.strikethrough"
  | "format.heading"
  | "format.blockquote"
  | "format.bulletList"
  | "format.orderedList"
  | "format.inlineCode"
  | "format.clear"
  | "view.toggleWritingMode";

export interface EditorCommand {
  id: EditorCommandId;
  level?: 1 | 2 | 3;
}

export interface SelectionToken {
  editorId: string;
  generation: number;
  selectionRevision: number;
}

export interface EditorSelectionSnapshot {
  kind: "none" | "caret" | "text" | "node" | "all";
  from: number;
  to: number;
  text: string;
  anchor: { x: number; y: number } | null;
  head: { x: number; y: number } | null;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null;
  revision: number;
  token: SelectionToken;
}

export interface EditorInteractionSnapshot {
  editorId: string;
  generation: number;
  ready: boolean;
  active: boolean;
  focused: boolean;
  composing: boolean;
  documentFormat: DocumentFormat;
  capabilities: DocumentCapabilities;
  selection: EditorSelectionSnapshot;
  availability: Readonly<Record<EditorCommandId, boolean>>;
}

export interface EditorSearchToken {
  editorId: string;
  generation: number;
  contentRevision: number;
}

export interface EditorSearchMatch extends SearchMatch {
  contextBefore?: string;
  contextAfter?: string;
}

export interface EditorSearchQuery {
  term: string;
  options: SearchOptions;
}

export interface EditorSearchQueryResult {
  token: EditorSearchToken;
  matches: EditorSearchMatch[];
}

export interface EditorSearchPresentation {
  token: EditorSearchToken | null;
  matches: readonly SearchMatch[];
  currentMatchIndex: number;
  searchTerm: string;
  visible: boolean;
  navigationNonce: number;
}

export interface EditorSearchReplaceCommand {
  replacement: string;
  matches: readonly SearchMatch[];
  token: EditorSearchToken | null;
  options: SearchOptions;
}

export type EditorCommandResult =
  | { status: "executed" }
  | { status: "unavailable" }
  | { status: "stale" }
  | { status: "failed"; error: unknown };

export interface EditorInteractionHandle {
  getSnapshot(): EditorInteractionSnapshot;
  subscribe(listener: () => void): () => void;
  execute(command: EditorCommand, token?: SelectionToken): EditorCommandResult;
  prepareSearchSelection(): string | undefined;
  querySearch(query: EditorSearchQuery): EditorSearchQueryResult;
  syncSearchPresentation(presentation: EditorSearchPresentation): void;
  replaceSearch(command: EditorSearchReplaceCommand): EditorCommandResult;
}
