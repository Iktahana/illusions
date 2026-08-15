import type { DocumentCapabilities, DocumentFormat } from "@/lib/document-format";
import type { SearchMatch, SearchOptions } from "@/lib/editor-page/find-search-matches";
import type {
  MdiNode,
  MdiSourceSpan,
  MdiTextAnnotation,
  MdiTextRange,
  MdiTextSourceMap,
} from "@illusions-lab/mdi";

export type EditorCommandId =
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.paste"
  | "edit.selectAll"
  | "format.ruby"
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
  | "speech.toggle"
  | "speech.stop"
  | "view.toggleWritingMode";

export interface ExistingRubySelection {
  base: string;
  reading: string | readonly string[];
}

export interface RubyApplicationSegment {
  base: string;
  ruby?: string | readonly string[];
}

export type EditorCommand =
  | { id: "format.heading"; level?: 1 | 2 | 3 }
  | { id: "format.ruby"; mode: "apply"; segments: readonly RubyApplicationSegment[] }
  | { id: "format.ruby"; mode: "remove" }
  | {
      id: Exclude<EditorCommandId, "format.heading" | "format.ruby">;
    };

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
  ruby: ExistingRubySelection | null;
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

export interface EditorPosHighlightToken {
  editorId: string;
  generation: number;
  contentRevision: number;
  viewportRevision: number;
}

export interface EditorPosHighlightAtomAdjustment {
  textPos: number;
  cumulativeOffset: number;
}

export interface EditorPosHighlightParagraphSegment {
  segmentType: "paragraph";
  index: number;
  pos: number;
  text: string;
  atomAdjustments: EditorPosHighlightAtomAdjustment[];
}

export interface EditorPosHighlightMdiSegment {
  segmentType: "mdi-block";
  index: number;
  blockIndex: number;
  kind:
    | "heading"
    | "paragraph"
    | "listItem"
    | "blockquote"
    | "code"
    | "table"
    | "footnote"
    | "html"
    | "other";
  text: string;
  range: MdiTextRange;
  span?: MdiSourceSpan;
  sourceMap: MdiTextSourceMap;
  annotations: MdiTextAnnotation[];
  node: MdiNode;
}

export type EditorPosHighlightSegment =
  EditorPosHighlightParagraphSegment | EditorPosHighlightMdiSegment;

export interface EditorPosHighlightRequest {
  token: EditorPosHighlightToken;
  documentFormat: DocumentFormat;
  source?: string;
  segments: readonly EditorPosHighlightSegment[];
}

export interface EditorPosHighlightMatch {
  segmentIndex: number;
  start: number;
  end: number;
  category: string;
}

export interface EditorPosHighlightPresentation {
  token: EditorPosHighlightToken | null;
  request: EditorPosHighlightRequest | null;
  matches: readonly EditorPosHighlightMatch[];
  colors: Readonly<Record<string, string>>;
  disabledTypes: readonly string[];
  visible: boolean;
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
  createPosHighlightRequest(): EditorPosHighlightRequest | null;
  syncPosHighlightPresentation(presentation: EditorPosHighlightPresentation): void;
  prepareSearchSelection(): string | undefined;
  querySearch(query: EditorSearchQuery): EditorSearchQueryResult;
  syncSearchPresentation(presentation: EditorSearchPresentation): void;
  replaceSearch(command: EditorSearchReplaceCommand): EditorCommandResult;
}
