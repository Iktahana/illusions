import type { DocumentCapabilities, DocumentFormat } from "@/lib/document-format";

export type EditorCommandId =
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.paste"
  | "edit.selectAll"
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

export type EditorCommandResult =
  | { status: "executed" }
  | { status: "unavailable" }
  | { status: "stale" }
  | { status: "failed"; error: unknown };

export interface EditorInteractionHandle {
  getSnapshot(): EditorInteractionSnapshot;
  subscribe(listener: () => void): () => void;
  execute(command: EditorCommand, token?: SelectionToken): EditorCommandResult;
}
